import PromptInputGroup from "@/components/groups/prompt-input-group";
import MessageView from "@/components/views/message/message-view";
import { useChat, useLlama, useSystem } from "@/context";
import { randomUUID } from "expo-crypto";
import { getConversation, hasNode, MessageNode } from "message-nodes";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";

function getModelInfo(modelKey: string | undefined) {
  const key = (modelKey ?? "").toLowerCase();

  if (key.includes("1.5b") || key.includes("1_5b")) {
    return {
      name: "Michael Pro",
      description: "1.5B • Plus puissant",
      icon: "🧠",
    };
  }

  if (
    key.includes("1b") ||
    key.includes("1.0b") ||
    key.includes("plus")
  ) {
    return {
      name: "Michael Plus",
      description: "1B • Équilibré",
      icon: "⚙️",
    };
  }

  if (key.includes("0.5b") || key.includes("0_5b")) {
    return {
      name: "Michael",
      description: "0.5B • Rapide et léger",
      icon: "🤖",
    };
  }

  return {
    name: modelKey
      ? modelKey.replace(" (local)", "")
      : "Aucun modèle",
    description: "Modèle local",
    icon: "🤖",
  };
}

function Chat() {
  const { colorScheme } = useSystem();
  const { mappings, root } = useChat();
  const {
    modelKey,
    modelFiles,
    setModelKey,
    ready,
    busy,
  } = useLlama();

  const insets = useSafeAreaInsets();

  const [modelMenuOpen, setModelMenuOpen] =
    useState(false);

  const currentModel = getModelInfo(modelKey);

  const availableModels = Object.keys(modelFiles);

  const renderItem = ({
    item,
  }: {
    item: MessageNode;
  }) => (
    <MessageView
      key={item.id}
      message={item}
    />
  );

  const styles = StyleSheet.create({
    view: {
      flex: 1,
      flexDirection: "column",
      backgroundColor: colorScheme.surface,
      padding: 8,
    },

    list: {
      flex: 1,
      width: "100%",
    },

    composer: {
      paddingBottom: insets.bottom,
    },

    modelBar: {
      width: "100%",
      minHeight: 58,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginBottom: 8,
      backgroundColor: colorScheme.surfaceVariant,
    },

    modelButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    modelLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },

    modelIcon: {
      fontSize: 23,
      marginRight: 10,
    },

    modelTextContainer: {
      flex: 1,
    },

    modelName: {
      fontSize: 16,
      fontWeight: "700",
      color: colorScheme.onSurface,
    },

    modelDescription: {
      fontSize: 12,
      marginTop: 2,
      color: colorScheme.onSurfaceVariant,
    },

    status: {
      fontSize: 11,
      marginTop: 2,
    },

    menu: {
      marginTop: 8,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: colorScheme.surface,
    },

    menuItem: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
    },

    menuItemActive: {
      backgroundColor: colorScheme.surfaceVariant,
    },

    menuIcon: {
      fontSize: 22,
      width: 35,
    },

    menuText: {
      flex: 1,
    },

    menuName: {
      fontSize: 15,
      fontWeight: "600",
      color: colorScheme.onSurface,
    },

    menuDescription: {
      fontSize: 12,
      marginTop: 2,
      color: colorScheme.onSurfaceVariant,
    },

    arrow: {
      fontSize: 16,
      color: colorScheme.onSurfaceVariant,
    },
  });

  if (root && !hasNode(mappings, root)) {
    console.warn(
      `No conversation found for id ${root}`
    );
  }

  return (
    <KeyboardAvoidingView
      testID="chat-page"
      behavior="padding"
      automaticOffset
      keyboardVerticalOffset={-insets.bottom}
      style={styles.view}
    >
      <View style={styles.modelBar}>
        <Pressable
          style={styles.modelButton}
          onPress={() =>
            setModelMenuOpen(!modelMenuOpen)
          }
        >
          <View style={styles.modelLeft}>
            <Text style={styles.modelIcon}>
              {currentModel.icon}
            </Text>

            <View style={styles.modelTextContainer}>
              <Text style={styles.modelName}>
                {currentModel.name}
              </Text>

              <Text style={styles.modelDescription}>
                {currentModel.description}
              </Text>

              <Text
                style={[
                  styles.status,
                  {
                    color: ready
                      ? "#35B86B"
                      : "#D88A25",
                  },
                ]}
              >
                {busy
                  ? "● Génération..."
                  : ready
                    ? "● Modèle prêt • Local"
                    : "● Chargement..."}
              </Text>
            </View>
          </View>

          <Text style={styles.arrow}>
            {modelMenuOpen ? "▲" : "▼"}
          </Text>
        </Pressable>

        {modelMenuOpen && (
          <View style={styles.menu}>
            {availableModels.map((key) => {
              const info = getModelInfo(key);

              const active = key === modelKey;

              return (
                <Pressable
                  key={key}
                  style={[
                    styles.menuItem,
                    active &&
                      styles.menuItemActive,
                  ]}
                  onPress={() => {
                    if (key !== modelKey) {
                      setModelKey(key);
                    }

                    setModelMenuOpen(false);
                  }}
                >
                  <Text style={styles.menuIcon}>
                    {info.icon}
                  </Text>

                  <View style={styles.menuText}>
                    <Text style={styles.menuName}>
                      {info.name}
                    </Text>

                    <Text
                      style={
                        styles.menuDescription
                      }
                    >
                      {info.description}
                    </Text>
                  </View>

                  {active && (
                    <Text style={styles.arrow}>
                      ✓
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {root ? (
        <FlatList
          data={getConversation(
            mappings,
            root
          ).slice(1)}
          style={styles.list}
          keyExtractor={(item) =>
            item.id?.toString() ??
            randomUUID()
          }
          renderItem={renderItem}
        />
      ) : (
        <View style={styles.list} />
      )}

      <View style={styles.composer}>
        <PromptInputGroup />
      </View>
    </KeyboardAvoidingView>
  );
}

export default Chat;