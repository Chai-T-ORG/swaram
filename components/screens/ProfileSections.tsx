"use client";

/**
 * The three settings sections, shared by both platform bodies (the controls
 * are identical; only the surrounding layout differs). Each takes the
 * useProfileSettings() bundle.
 */

import { speak } from "@/lib/voice/textToSpeech";
import { resetOnboarding, type TtsProvider, type SttProvider, type MicMode } from "@/lib/voice/voiceSettings";
import { PROFILE_FIELDS, STT_LANGS, type ProfileSettings } from "./useProfileSettings";
import { IconCheck, IconInfo, IconShield, IconTrash, IconUser, IconWave, IconRefresh } from "@/components/icons";

export function VoiceSection({ p }: { p: ProfileSettings }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="card flex items-center justify-between p-5 border border-line bg-raised shadow-sm">
        <div className="flex items-center gap-3.5">
          <img src="/logo.png" alt="Swaram Logo" className="h-11 w-11 rounded-2xl object-contain shadow-xs" />
          <div>
            <h2 className="font-display text-lg text-ink leading-tight">Swaram Voice Assistant</h2>
            <p className="text-xs text-soft">Voice-first form engine for blind and low-vision users.</p>
          </div>
        </div>
      </section>

      <section className="card flex flex-col gap-5">
        <h2 className="border-b border-line pb-3 font-display text-lg text-ink">Voice &amp; speech</h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="voice-select" className="text-xs font-bold uppercase text-soft">
            Speaking voice
          </label>
          <p className="text-xs leading-relaxed text-faint">
            Voices come from your browser and system — Chrome and Edge ship natural-sounding ones.
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            <select
              id="voice-select"
              className="field-input min-h-12 max-w-sm flex-1 text-sm"
              value={p.voiceURI}
              onChange={(e) => p.selectVoice(e.target.value)}
            >
              <option value="">Automatic (recommended)</option>
              {p.voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary min-h-12 px-4 text-xs"
              onClick={() => speak("Hello! I'm Swaram. I'll read your forms and fill them as you speak.")}
            >
              <IconWave className="h-4 w-4" />
              <span>Preview</span>
            </button>
          </div>
        </div>

        <div className="flex max-w-sm flex-col gap-1.5">
          <label htmlFor="rate-slider" className="text-xs font-bold uppercase text-soft">
            Speaking speed <span className="text-accent">({p.rate.toFixed(2)}&times;)</span>
          </label>
          <input
            id="rate-slider"
            type="range"
            min={0.7}
            max={1.6}
            step={0.05}
            value={p.rate}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-(--accent)"
            onChange={(e) => p.selectRate(Number(e.target.value))}
            onPointerUp={() => speak("This is how fast I speak now.")}
          />
        </div>

        <div className="flex max-w-sm flex-col gap-1.5">
          <label htmlFor="stt-lang" className="text-xs font-bold uppercase text-soft">
            Assistant language — voice, recognition &amp; replies
          </label>
          <select
            id="stt-lang"
            className="field-input min-h-12 text-sm"
            value={p.sttLang}
            onChange={(e) => p.selectLang(e.target.value)}
          >
            {STT_LANGS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2 flex flex-col gap-2 border-t border-line/65 pt-4">
          <label htmlFor="tts-provider-select" className="text-xs font-bold uppercase text-soft">
            Speech generation
          </label>
          <select
            id="tts-provider-select"
            className="field-input min-h-12 max-w-sm text-sm"
            value={p.ttsProvider === "google" ? "cloud" : p.ttsProvider}
            onChange={(e) => p.selectTtsProvider(e.target.value as TtsProvider)}
          >
            <option value="cloud">Cloud neural voice — recommended, works everywhere, no download</option>
            <option value="system">System voice — instant, uses your device&rsquo;s built-in voices</option>
            <option value="local">On-device AI voice (Kokoro) — private &amp; offline, ~90MB download</option>
          </select>

          {(p.ttsProvider === "cloud" || p.ttsProvider === "google") && (
            <p className="mt-1 max-w-sm text-[11px] leading-normal text-soft">
              {p.cloudTtsEngine === "azure"
                ? "Using Azure Neural voices — studio-grade — in your selected language."
                : p.cloudTtsEngine === "kokoro"
                  ? "Using the natural Kokoro voice for English (runs on the server, so it works on every device). Other languages use Google, in the right language."
                  : "Using Google voices in your selected language. On a persistent server the natural Kokoro voice loads automatically for English; add an Azure key for studio-grade voices in every language."}
            </p>
          )}

          {p.ttsProvider === "local" && p.kokoroState.state !== "idle" && (
            <div className="mt-3 max-w-sm rounded-2xl border border-line bg-sunken p-4 animate-fade-in" role="status" aria-live="polite">
              {p.kokoroState.state === "loading" && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold leading-tight text-ink">{p.kokoroState.detail}</p>
                  <div
                    role="progressbar"
                    aria-label="AI voice download progress"
                    aria-valuenow={Math.round(p.kokoroState.progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2 w-full overflow-hidden rounded-full bg-line"
                  >
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${Math.round(p.kokoroState.progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] leading-normal text-faint">
                    Downloading assets. Keep using Swaram — the voice switches over automatically when it&rsquo;s ready.
                  </p>
                </div>
              )}
              {p.kokoroState.state === "ready" && (
                <p className="flex items-center gap-2 text-xs font-bold leading-none text-ok">
                  <IconCheck className="h-4 w-4" />
                  AI voice is active and running locally.
                </p>
              )}
              {p.kokoroState.state === "error" && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold leading-tight text-bad">{p.kokoroState.message}</p>
                  <button type="button" className="btn-secondary min-h-10 self-start px-3 text-xs" onClick={p.retryKokoro}>
                    Retry download
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-2 border-t border-line/65 pt-4">
          <label htmlFor="mic-mode-select" className="text-xs font-bold uppercase text-soft">
            Listening mode
          </label>
          <select
            id="mic-mode-select"
            className="field-input min-h-12 max-w-sm text-sm"
            value={p.micMode}
            onChange={(e) => p.selectMicMode(e.target.value as MicMode)}
          >
            <option value="ptt">Push-to-talk — hold space / tap to speak (best in noise)</option>
            <option value="continuous">Hands-free — always listening (quiet rooms only)</option>
          </select>
          <p className="max-w-sm text-[11px] leading-normal text-faint">
            In a noisy room push-to-talk is far more reliable — the microphone only records while you hold or tap it.
          </p>
        </div>

        <div className="mt-2 flex flex-col gap-2 border-t border-line/65 pt-4">
          <label className="text-xs font-bold uppercase text-soft">
            First-run welcome setup
          </label>
          <p className="max-w-sm text-xs leading-relaxed text-soft">
            Replay the initial voice onboarding flow to test your microphone or change listening options. Your saved profile details and model caches will not be lost.
          </p>
          <button
            type="button"
            className="btn-secondary min-h-12 max-w-sm text-xs self-start flex items-center gap-2"
            onClick={() => {
              resetOnboarding();
              window.dispatchEvent(new Event("swaram_replay_onboarding"));
            }}
          >
            <IconRefresh className="h-4 w-4 text-accent" />
            <span>Replay welcome onboarding</span>
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-2 border-t border-line/65 pt-4">
          <label htmlFor="stt-provider-select" className="text-xs font-bold uppercase text-soft">
            Speech recognition
          </label>
          <select
            id="stt-provider-select"
            className="field-input min-h-12 max-w-sm text-sm"
            value={p.sttProvider}
            onChange={(e) => p.selectSttProvider(e.target.value as SttProvider)}
          >
            <option value="groq">Cloud Whisper (Groq) — most accurate, needs internet</option>
            <option value="azure">Azure Speech (Regional) — tuned per language, needs internet</option>
            <option value="azure-stream">Azure Speech — real-time (beta) — fastest, auto-detects language</option>
            <option value="auto">Automatic — cloud when online, on-device otherwise</option>
            <option value="whisper">On-device Whisper — private &amp; offline (~150MB)</option>
            <option value="native">Browser built-in — instant, no download</option>
          </select>

          {p.sttProvider === "azure-stream" && (
            <p className="mt-1 max-w-sm text-[11px] leading-normal text-soft">
              Real-time streaming: text appears as you speak, auto-detecting English, Hindi, Malayalam or French. If it
              can&rsquo;t connect it falls back to the standard Azure path automatically.
            </p>
          )}

          {(p.sttProvider === "azure" || p.sttProvider === "azure-stream") && (
            <div className="mt-1 flex max-w-sm flex-col gap-2.5 rounded-2xl border border-line bg-sunken p-4">
              {p.azureEnvKey ? (
                <p className="flex items-center gap-2 text-xs font-bold leading-tight text-ok">
                  <IconCheck className="h-4 w-4" />
                  Azure key configured on the server. Ready to go.
                </p>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-xs font-bold leading-tight text-warn">
                    <IconInfo className="h-4 w-4 shrink-0" />
                    No Azure key detected on the server.
                  </p>
                  <p className="text-[10px] leading-normal text-faint">
                    Azure recognition needs a server key and region. Set{" "}
                    <code className="rounded bg-raised px-1 py-0.5 font-mono">AZURE_SPEECH_KEY</code> and{" "}
                    <code className="rounded bg-raised px-1 py-0.5 font-mono">AZURE_SPEECH_REGION</code> on the server,
                    then restart it. Until then, recognition falls back to cloud Whisper or the browser&rsquo;s built-in
                    engine.
                  </p>
                </>
              )}
            </div>
          )}

          {(p.sttProvider === "groq" || p.sttProvider === "auto") && (
            <div className="mt-1 flex max-w-sm flex-col gap-2.5 rounded-2xl border border-line bg-sunken p-4">
              {p.groqEnvKey ? (
                <p className="flex items-center gap-2 text-xs font-bold leading-tight text-ok">
                  <IconCheck className="h-4 w-4" />
                  Cloud key configured on the server. Ready to go.
                </p>
              ) : (
                <>
                  <label htmlFor="groq-key" className="text-[11px] font-bold uppercase text-soft">
                    Groq API key
                  </label>
                  <p className="text-[10px] leading-normal text-faint">
                    No server key detected. Paste a Groq key to enable cloud recognition on this device — stored only in
                    this browser. For a shared deploy, set{" "}
                    <code className="rounded bg-raised px-1 py-0.5 font-mono">GROQ_API_KEY</code> on the server instead.
                  </p>
                  <div className="flex gap-2">
                    <input
                      id="groq-key"
                      type="password"
                      className="field-input min-h-12 flex-1 text-sm"
                      placeholder="gsk_…"
                      value={p.groqKey}
                      onChange={(e) => p.setGroqKeyState(e.target.value)}
                    />
                    <button type="button" className="btn-secondary min-h-12 px-3 text-xs" onClick={p.saveGroqKey}>
                      Save
                    </button>
                  </div>
                  {!p.groqKey && (
                    <p className="text-[10px] font-bold leading-normal text-warn">
                      Without a key, recognition falls back to the browser&rsquo;s built-in engine.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function PersonalSection({ p }: { p: ProfileSettings }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="card flex gap-4">
        <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <IconShield className="h-5 w-5" />
        </span>
        <div>
          <h2 className="mb-1 text-sm font-bold text-ink">Your ID numbers are never saved</h2>
          <p className="text-xs leading-relaxed text-soft">
            Aadhaar, PAN, passport, voter card and bank numbers never enter your profile. When a form asks for them,
            they go straight into the final PDF and are discarded immediately.
          </p>
        </div>
      </div>

      <form
        className="card flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          p.save();
        }}
      >
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <IconUser className="h-5 w-5 text-accent" />
          <h2 className="font-display text-lg text-ink">Details for auto-fill</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {PROFILE_FIELDS.map((field) => (
            <div key={field.key} className={`flex flex-col gap-1.5 ${field.key === "address" ? "sm:col-span-2" : ""}`}>
              <label htmlFor={`profile-${field.key}`} className="text-xs font-bold text-soft">
                {field.label}
              </label>
              <input
                id={`profile-${field.key}`}
                className="field-input min-h-12 text-sm"
                type="text"
                value={p.values[field.key] ?? ""}
                placeholder={field.hint}
                onChange={(e) => p.setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2.5 border-t border-line/65 pt-3.5">
          <button type="submit" className="btn-primary min-h-12 px-5 text-xs">
            Save changes
          </button>
          <button type="button" className="btn-danger min-h-12 px-4 text-xs" onClick={p.clearAll}>
            Delete saved details
          </button>
        </div>
      </form>
    </div>
  );
}

export function CloudSection({ p }: { p: ProfileSettings }) {
  return (
    <section className="card flex flex-col gap-5">
      <h2 className="border-b border-line pb-3 font-display text-lg text-ink">Cloud backup (optional)</h2>

      {!p.configured ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed text-soft">
            Cloud backup is currently disabled — your profile lives only on this device. To enable it, set these
            environment variables on the server:
          </p>
          <pre className="overflow-x-auto rounded-xl border border-line bg-sunken p-3 font-mono text-[10.5px] text-ink">
            NEXT_PUBLIC_SUPABASE_URL=your-supabase-url{"\n"}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-key
          </pre>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 cursor-pointer rounded border-line accent-(--accent)"
              checked={p.consent}
              onChange={(e) => p.handleConsentChange(e.target.checked)}
            />
            <span className="text-xs leading-relaxed text-soft">
              I agree to back up my profile details to the cloud so I can restore them on other devices. Sensitive
              government IDs are never synced.
            </span>
          </label>

          {p.consent && (
            <div className="mt-1 flex flex-wrap gap-2.5 border-t border-line/65 pt-3.5">
              <button type="button" className="btn-primary min-h-12 px-5 text-xs" onClick={p.syncNow} disabled={p.cloudBusy}>
                Back up now
              </button>
              <button type="button" className="btn-secondary min-h-12 px-4 text-xs" onClick={p.fetchCloud} disabled={p.cloudBusy}>
                Restore backup
              </button>
              <button
                type="button"
                className="btn-danger min-h-12 px-4 text-xs sm:ml-auto"
                onClick={p.deleteCloud}
                disabled={p.cloudBusy}
              >
                <IconTrash className="h-3.5 w-3.5" />
                Delete cloud backup
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
