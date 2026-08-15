import useStateRef from '@/hooks/use-state-ref';
import useStoredRecord from '@/hooks/use-stored-record';
import useStoredString from '@/hooks/use-stored-string';
import { getDocumentAsync } from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  initLlama,
  LlamaContext as LlamaRnContext,
  loadLlamaModelInfo,
  RNLlamaOAICompatibleMessage,
} from 'llama.rn';
import { MessageNode } from 'message-nodes';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { LlamaContextProps } from './types';

/**
 * ============================================================
 * MICHAEL AI
 * Personnalité commune aux différents modèles Michael.
 * ============================================================
 */

const MICHAEL_SYSTEM_PROMPT = `Tu es Michael, une intelligence artificielle locale qui fonctionne directement sur le téléphone de l'utilisateur.

Ton nom est Michael.

IDENTITÉ :
Tu es une IA locale conçue pour fonctionner directement sur Android.
Tu ne prétends jamais être humain.
Tu ne prétends pas avoir une mémoire permanente si le logiciel ne t'en fournit pas une.

PERSONNALITÉ :
Tu es curieux, intelligent, calme, pragmatique et naturel.
Tu aimes l'ingénierie, l'informatique, les sciences, la technologie, la création et les jeux vidéo.
Tu aimes comprendre comment les choses fonctionnent.
Tu peux utiliser un humour léger et naturel lorsque le contexte s'y prête.
Tu reconnais tes erreurs et corriges tes réponses.

LANGUE :
Réponds principalement en français.
Tu peux utiliser une autre langue si l'utilisateur le demande.

RÈGLES :
- Réponds directement à la question.
- N'invente pas une information lorsque tu ne la connais pas.
- Si tu n'es pas certain, indique-le clairement.
- Pour les problèmes complexes, explique progressivement les étapes importantes.
- Ne répète pas inutilement la question de l'utilisateur.
- Ne prétends pas avoir accès à Internet si ce n'est pas le cas.
- Lorsque l'utilisateur demande ton nom, réponds que tu t'appelles Michael.

STYLE :
Pour une question simple, donne une réponse simple.
Pour une question technique, sois précis et détaillé.
Utilise des exemples lorsque cela améliore la compréhension.
`;

/**
 * Vérifie la signature GGUF.
 *
 * Un fichier GGUF commence par les quatre octets :
 * G G U F
 */

async function isGGUF(fileUri: string): Promise<boolean> {
  try {
    const b64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 4,
      position: 0,
    });

    const bin = globalThis.atob
      ? globalThis.atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');

    if (bin.length < 4) {
      return false;
    }

    return (
      (bin.charCodeAt(0) & 0xff) === 0x47 &&
      (bin.charCodeAt(1) & 0xff) === 0x47 &&
      (bin.charCodeAt(2) & 0xff) === 0x55 &&
      (bin.charCodeAt(3) & 0xff) === 0x46
    );
  } catch {
    return false;
  }
}

/**
 * ============================================================
 * IMPORTANT :
 *
 * Maid supprimait auparavant tous les anciens modèles "(local)".
 *
 * Michael AI doit pouvoir conserver plusieurs modèles :
 *
 *   Michael       0.5B
 *   Michael Plus  1B
 *   Michael Pro   1.5B
 *
 * On ne supprime donc plus les anciens modèles.
 * ============================================================
 */

function parseMessages(
  messages: Array<MessageNode>
): Array<RNLlamaOAICompatibleMessage> {
  const conversation = messages.filter(
    (message) => message.role !== 'system'
  );

  return [
    {
      role: 'system',
      content: MICHAEL_SYSTEM_PROMPT,
    } as RNLlamaOAICompatibleMessage,

    ...conversation.map((message) => {
      const images: Array<string> | undefined =
        (message.metadata as any)?.images;

      if (images && images.length > 0) {
        return {
          role: message.role,
          content: [
            {
              type: 'text',
              text: message.content as string,
            },
            ...images.map((uri) => ({
              type: 'image_url' as const,
              image_url: {
                url: uri,
              },
            })),
          ],
        } as RNLlamaOAICompatibleMessage;
      }

      return message as unknown as RNLlamaOAICompatibleMessage;
    }),
  ];
}

const LlamaContext = createContext<LlamaContextProps | undefined>(undefined);

export function LlamaProvider({
  children,
}: {
  children: ReactNode;
}) {
  const loadIdRef = useRef<number>(0);

  const [busy, setBusy] = useState<boolean>(false);
  const [imagesSupported, setImagesSupported] =
    useState<boolean>(false);

  /**
   * ============================================================
   * MODÈLES
   * ============================================================
   */

  const [modelKey, setModelKey] =
    useStoredString('llama-model-file-key');

  const [modelFiles, setModelFiles] =
    useStoredRecord<string, string>('llama-model-files');

  /**
   * ============================================================
   * PROJECTEURS MULTIMODAUX
   * ============================================================
   */

  const [projectorKey, setProjectorKey] =
    useStoredString('llama-projector-file-key');

  const [projectorFiles, setProjectorFiles] =
    useStoredRecord<string, string>(
      'llama-projector-files'
    );

  /**
   * ============================================================
   * PARAMÈTRES LLAMA.CPP
   * ============================================================
   */

  const [parameters, setParameters] =
    useStoredRecord('llama-parameters');

  const [
    llama,
    llamaRef,
    setLlama,
  ] = useStateRef<LlamaRnContext | undefined>(undefined);

  /**
   * ============================================================
   * CHARGEMENT DU MODÈLE
   * ============================================================
   */

  useEffect(() => {
    let cancelled = false;

    let timeout: ReturnType<typeof setTimeout> | null =
      null;

    const loadModel = async () => {
      if (!modelKey || !modelFiles[modelKey]) {
        return;
      }

      const modelFile = modelFiles[modelKey];

      const isGguf = await isGGUF(modelFile);

      if (!isGguf) {
        console.error(
          'Selected model is not a valid GGUF file:',
          modelFile
        );

        return;
      }

      const currentLoadId = ++loadIdRef.current;

      timeout = setTimeout(async () => {
        while (busy) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000)
          );

          if (
            cancelled ||
            currentLoadId !== loadIdRef.current
          ) {
            return;
          }
        }

        setBusy(true);

        try {
          /**
           * Libère le modèle précédent avant de charger
           * le nouveau.
           */

          const oldContext = llamaRef.current;

          setLlama(undefined);

          await oldContext?.release();

          /**
           * Récupération de la taille de contexte native
           * du modèle.
           */

          const info =
            (await loadLlamaModelInfo(
              modelFile
            )) as Record<string, any>;

          const ctxKey = Object.keys(info).find(
            (key) =>
              key
                .toLowerCase()
                .endsWith('context_length')
          );

          const n_ctx = ctxKey
            ? Number(info[ctxKey])
            : 2048;

          /**
           * ==================================================
           * PROJECTEUR
           * ==================================================
           */

          const useProjector =
            !!projectorKey &&
            !!projectorFiles[projectorKey] &&
            (
              projectorKey === modelKey ||
              modelKey.endsWith('(local)')
            );

          /**
           * ==================================================
           * LLAMA.CPP
           * ==================================================
           *
           * Les paramètres personnalisés sont appliqués
           * après les valeurs par défaut.
           */

          const llamaContext = await initLlama({
            model: modelFile,

            use_mlock: true,

            n_ctx,

            /**
             * Permet au moteur d'utiliser l'accélération
             * disponible sur l'appareil.
             */
            n_gpu_layers: 99,

            ...parameters,

            ctx_shift: !useProjector,
          });

          /**
           * ==================================================
           * MULTIMODALITÉ
           * ==================================================
           */

          if (useProjector) {
            await llamaContext.initMultimodal({
              path: projectorFiles[projectorKey],
              use_gpu: true,
            });
          }

          /**
           * Si un autre chargement a commencé pendant
           * celui-ci, on abandonne celui qui vient de finir.
           */

          if (
            cancelled ||
            currentLoadId !== loadIdRef.current
          ) {
            await llamaContext.release();
            return;
          }

          setLlama(llamaContext);

          /**
           * Vérification du support image.
           */

          if (useProjector) {
            const support =
              await llamaContext.getMultimodalSupport();

            setImagesSupported(support.vision);
          } else {
            setImagesSupported(false);
          }
        } catch (error) {
          console.error(
            'Error initializing model:',
            error
          );
        } finally {
          if (!cancelled) {
            setBusy(false);
          }
        }
      }, 400);
    };

    loadModel();

    return () => {
      cancelled = true;

      if (timeout !== null) {
        clearTimeout(timeout);
      }
    };
  }, [
    modelKey,
    modelFiles,
    projectorKey,
    projectorFiles,
    parameters,
  ]);

  /**
   * ============================================================
   * IMPORTATION D'UN MODÈLE GGUF
   * ============================================================
   */

  const pickModelFile = async () => {
    const file = await getDocumentAsync({
      multiple: false,
    });

    if (file.canceled || file.assets === null) {
      return;
    }

    const asset = file.assets[0];

    /**
     * Vérification extension + signature GGUF.
     */

    if (
      !/\.gguf$/i.test(asset.name) ||
      !(await isGGUF(asset.uri))
    ) {
      alert(
        'Michael AI : veuillez sélectionner un fichier GGUF valide.'
      );

      return;
    }

    /**
     * Le nom affiché dans l'application.
     *
     * Exemple :
     *
     * michael-0.5b.gguf
     *     ↓
     * michael-0.5b (local)
     */

    const name = `${asset.name.replace(
      /\.[^/.]+$/,
      ''
    )} (local)`;

    const newPath =
      FileSystem.documentDirectory + asset.name;

    /**
     * Copie/déplace le fichier dans le stockage
     * permanent de l'application.
     */

    await FileSystem.moveAsync({
      from: asset.uri,
      to: newPath,
    });

    /**
     * IMPORTANT :
     *
     * On conserve maintenant les modèles précédemment
     * importés.
     */

    const updatedModelFiles = {
      ...modelFiles,
      [name]: newPath,
    };

    setModelFiles(updatedModelFiles);

    /**
     * Le nouveau modèle devient automatiquement
     * le modèle actif.
     */

    setModelKey(name);
  };

  /**
   * ============================================================
   * IMPORTATION D'UN PROJECTEUR MULTIMODAL
   * ============================================================
   */

  const pickProjectorFile = async () => {
    const file = await getDocumentAsync({
      multiple: false,
    });

    if (file.canceled || file.assets === null) {
      return;
    }

    const asset = file.assets[0];

    if (
      !/\.mmproj$/i.test(asset.name) &&
      !/\.gguf$/i.test(asset.name)
    ) {
      alert(
        'Michael AI : veuillez sélectionner un projecteur multimodal valide.'
      );

      return;
    }

    const name = `${asset.name.replace(
      /\.[^/.]+$/,
      ''
    )} (local)`;

    const newPath =
      FileSystem.documentDirectory + asset.name;

    await FileSystem.moveAsync({
      from: asset.uri,
      to: newPath,
    });

    /**
     * Les projecteurs peuvent eux aussi être conservés.
     */

    const updatedProjectorFiles = {
      ...projectorFiles,
      [name]: newPath,
    };

    setProjectorFiles(updatedProjectorFiles);

    setProjectorKey(name);
  };

  /**
   * ============================================================
   * GÉNÉRATION
   * ============================================================
   */

  const prompt = async (
    messages: Array<MessageNode>,
    onUpdate: (message: string) => void
  ) => {
    if (!llama) {
      console.warn('LLM not initialized');
      return;
    }

    if (busy) {
      console.warn('LLM is busy');
      return;
    }

    setBusy(true);

    try {
      const result = await llama.completion(
        {
          messages: parseMessages(messages),
        },
        (data) => {
          onUpdate(data.token);
        }
      );

      console.log(
        'Michael AI timings:',
        result.timings
      );
    } catch (error) {
      console.error(
        'Error prompting Michael:',
        error
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * ============================================================
   * ARRÊT DE LA GÉNÉRATION
   * ============================================================
   */

  const stop = async () => {
    if (!llama) {
      console.warn('LLM not initialized');
      return;
    }

    try {
      await llama.stopCompletion();
    } catch (error) {
      console.error(
        'Error stopping Michael:',
        error
      );
    }
  };

  /**
   * ============================================================
   * CONTEXTE PUBLIC
   * ============================================================
   */

  const value = {
    ready: !!llama,

    busy,

    imagesSupported,

    modelKey,

    pickModelFile,

    setModelKey,

    modelFiles,

    setModelFiles,

    pickProjectorFile,

    projectorKey,

    setProjectorKey,

    projectorFiles,

    setProjectorFiles,

    parameters,

    setParameters,

    prompt,

    stop,
  };

  return (
    <LlamaContext.Provider value={value}>
      {children}
    </LlamaContext.Provider>
  );
}

/**
 * ============================================================
 * HOOK PUBLIC
 * ============================================================
 */

export function useLlama() {
  const context = useContext(LlamaContext);

  if (!context) {
    throw new Error(
      'useLlama must be used within a LlamaProvider'
    );
  }

  return context;
}