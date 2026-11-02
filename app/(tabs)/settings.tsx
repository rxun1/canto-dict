// Settings tab (spec §6.3): the AI translation provider, its API key and a connection test, plus links to
// the data licenses and (development builds only) Dev checks.
// Presets show their base URL and model read-only; Custom makes them editable and saves them on 保存服务.
// The key field is masked and per provider; a key is saved or cleared only by its buttons, and once saved it
// never comes back into the UI (only whether one is saved). It is never logged or shown in a message.
import { Link } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ROW_PADDING } from "../../src/components/EntryRow";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { CUSTOM_PROVIDER, PRESETS, PROVIDERS } from "../../src/settings/presets";
import {
  clearApiKey,
  CustomProviderError,
  getActiveProvider,
  getApiKey,
  getCustomProvider,
  normalizeCustomProvider,
  saveCustomProvider,
  setActiveProvider,
  setApiKey,
  type CustomProvider,
} from "../../src/settings/settings";
import { CONNECTION_MESSAGES, testConnection, type ConnectionResult } from "../../src/settings/testConnection";
import type { OnlineProvider } from "../../src/translate/online/client";
import { useUserDb } from "../../src/userdata/expoUserDb";

const BASE_URL = "服务地址";
const MODEL = "模型";
const API_KEY = "API 密钥";
const SAVE_CUSTOM = "保存服务";
const SAVE_KEY = "保存密钥";
const CLEAR_KEY = "清除密钥";
const TEST = "测试连接";
const TESTING = "正在测试…";
const KEY_SAVED = "已保存密钥";
const NO_KEY = "未保存密钥";
const SAVED = "已保存";
const SAVE_FAILED = "保存失败";
const LICENSES = "数据来源与授权";

const CUSTOM_FIELD_ERRORS: Readonly<Record<keyof CustomProvider, string>> = {
  baseURL: "服务地址须以 http:// 或 https:// 开头",
  model: "请输入模型名称",
};

const EMPTY_CUSTOM: CustomProvider = { baseURL: "", model: "" };
const SEGMENTS = PROVIDERS.map(({ id, label }) => ({ key: id, label }));

/** A status line under a section: a confirmation, or an error in red. */
interface Status {
  ok: boolean;
  message: string;
}

/** The message for a Custom provider that failed to save or normalize. Never the error's own text. */
function customErrorMessage(e: unknown): string {
  return e instanceof CustomProviderError ? CUSTOM_FIELD_ERRORS[e.field] : SAVE_FAILED;
}

export default function SettingsScreen() {
  const userDb = useUserDb();
  // null until the stored provider has loaded.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomProvider>(EMPTY_CUSTOM);
  const [customSaved, setCustomSaved] = useState(false);
  const [customStatus, setCustomStatus] = useState<Status | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [keyStatus, setKeyStatus] = useState<Status | null>(null);
  const [connection, setConnection] = useState<ConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);
  // Bumped on every provider switch, so replies about an earlier provider are dropped.
  const generation = useRef(0);

  const loadKeyStatus = useCallback((providerId: string) => {
    const current = generation.current;
    getApiKey(providerId).then(
      (key) => {
        if (generation.current === current) setKeySaved(key !== null);
      },
      () => console.warn("Reading the API key status failed"),
    );
  }, []);

  useEffect(() => {
    Promise.all([getActiveProvider(userDb), getCustomProvider(userDb)]).then(
      ([active, custom]) => {
        setCustomDraft(custom ?? EMPTY_CUSTOM);
        setCustomSaved(custom !== null);
        setSelectedId(active.id);
        loadKeyStatus(active.id);
      },
      (e: unknown) => console.warn("Loading settings failed", e),
    );
  }, [userDb, loadKeyStatus]);

  const select = useCallback(
    (id: string) => {
      generation.current++;
      setSelectedId(id);
      setKeyDraft("");
      setKeySaved(false);
      setKeyStatus(null);
      setCustomStatus(null);
      setConnection(null);
      setTesting(false);
      loadKeyStatus(id);
      // Custom becomes active only once saved.
      if (id !== CUSTOM_PROVIDER.id || customSaved) {
        setActiveProvider(userDb, id).catch((e: unknown) => console.warn("Saving the provider failed", e));
      }
    },
    [userDb, customSaved, loadKeyStatus],
  );

  const saveCustom = useCallback(async () => {
    try {
      const custom = normalizeCustomProvider(customDraft);
      await saveCustomProvider(userDb, custom);
      await setActiveProvider(userDb, CUSTOM_PROVIDER.id);
      setCustomDraft(custom);
      setCustomSaved(true);
      setCustomStatus({ ok: true, message: SAVED });
    } catch (e) {
      setCustomStatus({ ok: false, message: customErrorMessage(e) });
    }
  }, [userDb, customDraft]);

  const saveKey = useCallback(async () => {
    if (selectedId === null) return;
    if (keyDraft.trim() === "") {
      setKeyStatus({ ok: false, message: CONNECTION_MESSAGES.noKey });
      return;
    }
    try {
      await setApiKey(selectedId, keyDraft);
      setKeyDraft("");
      setKeySaved(true);
      setKeyStatus(null);
    } catch {
      setKeyStatus({ ok: false, message: SAVE_FAILED });
    }
  }, [selectedId, keyDraft]);

  const clearKey = useCallback(async () => {
    if (selectedId === null) return;
    try {
      await clearApiKey(selectedId);
      setKeyDraft("");
      setKeySaved(false);
      setKeyStatus(null);
    } catch {
      setKeyStatus({ ok: false, message: SAVE_FAILED });
    }
  }, [selectedId]);

  // Tests what is on screen: Custom's fields as typed, and a typed key before the saved one (nothing is saved).
  const test = useCallback(async () => {
    if (selectedId === null) return;
    const current = generation.current;
    const report = (result: ConnectionResult) => {
      if (generation.current !== current) return;
      setConnection(result);
      setTesting(false);
    };
    setTesting(true);
    setConnection(null);
    let provider: Omit<OnlineProvider, "apiKey">;
    if (selectedId === CUSTOM_PROVIDER.id) {
      try {
        provider = normalizeCustomProvider(customDraft);
      } catch (e) {
        return report({ ok: false, message: customErrorMessage(e) });
      }
    } else {
      const { id: _id, label: _label, ...preset } = PRESETS.find((p) => p.id === selectedId)!;
      provider = preset;
    }
    let apiKey: string | null = keyDraft.trim();
    if (apiKey === "") {
      try {
        apiKey = await getApiKey(selectedId);
      } catch {
        apiKey = null;
      }
    }
    if (apiKey === null) return report({ ok: false, message: CONNECTION_MESSAGES.noKey });
    report(await testConnection({ ...provider, apiKey }));
  }, [selectedId, customDraft, keyDraft]);

  const isCustom = selectedId === CUSTOM_PROVIDER.id;
  const preset = PRESETS.find((p) => p.id === selectedId);
  const shown = isCustom ? customDraft : preset ? { baseURL: preset.baseURL, model: preset.model } : EMPTY_CUSTOM;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {selectedId !== null && (
        <>
          <View style={styles.section}>
            <Text style={styles.heading}>AI 翻译服务</Text>
            <SegmentedControl segments={SEGMENTS} selected={selectedId} onSelect={select} />
            <Field
              label={BASE_URL}
              value={shown.baseURL}
              editable={isCustom}
              onChangeText={(baseURL) => setCustomDraft((c) => ({ ...c, baseURL }))}
              placeholder="https://"
              keyboardType="url"
            />
            <Field
              label={MODEL}
              value={shown.model}
              editable={isCustom}
              onChangeText={(model) => setCustomDraft((c) => ({ ...c, model }))}
            />
            {isCustom && <Button label={SAVE_CUSTOM} onPress={saveCustom} />}
            {customStatus && <StatusText status={customStatus} />}
          </View>

          <View style={styles.section}>
            <Field label={API_KEY} value={keyDraft} onChangeText={setKeyDraft} placeholder={keySaved ? "输入新密钥以替换" : "粘贴密钥"} secure />
            <Text style={styles.detail}>{keySaved ? KEY_SAVED : NO_KEY}</Text>
            <View style={styles.buttons}>
              <Button label={SAVE_KEY} onPress={saveKey} />
              {keySaved && <Button label={CLEAR_KEY} onPress={clearKey} destructive />}
            </View>
            {keyStatus && <StatusText status={keyStatus} />}
          </View>

          <View style={styles.section}>
            <Button label={TEST} onPress={test} disabled={testing} />
            {testing && <Text style={styles.detail}>{TESTING}</Text>}
            {connection && <StatusText status={connection} />}
          </View>
        </>
      )}

      <Link href="/licenses" style={styles.link}>
        {LICENSES}
      </Link>
      {__DEV__ && (
        <Link href="/dev-checks" style={styles.link}>
          Dev checks
        </Link>
      )}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editable = true,
  placeholder,
  keyboardType,
  secure = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
  placeholder?: string;
  keyboardType?: "url";
  secure?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.readOnly]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={PlatformColor("placeholderText")}
        keyboardType={keyboardType}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Button({ label, onPress, disabled = false, destructive = false }: { label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, destructive && styles.destructive, (pressed || disabled) && styles.pressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function StatusText({ status }: { status: Status }) {
  return <Text style={[styles.detail, !status.ok && styles.error]}>{status.message}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  content: { padding: ROW_PADDING, gap: 28 },
  section: { gap: 10 },
  heading: { fontSize: 20, fontWeight: "600", color: PlatformColor("label") },
  field: { gap: 4 },
  label: { fontSize: 13, color: PlatformColor("secondaryLabel") },
  input: {
    padding: 10,
    borderRadius: 10,
    fontSize: 17,
    color: PlatformColor("label"),
    backgroundColor: PlatformColor("tertiarySystemFill"),
  },
  readOnly: { color: PlatformColor("secondaryLabel") },
  buttons: { flexDirection: "row", gap: 12 },
  button: { alignSelf: "flex-start", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, backgroundColor: PlatformColor("systemBlue") },
  destructive: { backgroundColor: PlatformColor("systemRed") },
  buttonText: { fontSize: 17, fontWeight: "600", color: "white" },
  pressed: { opacity: 0.5 },
  detail: { fontSize: 15, color: PlatformColor("secondaryLabel") },
  error: { color: PlatformColor("systemRed") },
  link: { textAlign: "center", color: PlatformColor("link"), fontSize: 17 },
});
