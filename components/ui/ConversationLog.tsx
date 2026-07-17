"use client";

/**
 * The saved voice conversation for a form, read from
 * localStorage["swaram_conv_"+formId] — chat bubbles, assistant left,
 * user right. Shared by the history screens.
 */

import { readConvLog } from "@/components/screens/useHistory";

export default function ConversationLog({ formId }: { formId: string }) {
  const msgs = readConvLog(formId);

  return (
    <div className="mt-1 flex max-h-[300px] flex-col gap-3 overflow-y-auto rounded-2xl border border-line bg-sunken/60 p-4 animate-fade-in">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Conversation log</span>
        <span className="text-[9px] text-faint">Stored on device</span>
      </div>
      {!msgs || msgs.length === 0 ? (
        <p className="text-xs font-semibold text-soft">No speech recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {msgs.map((msg, idx) => {
            const isAssistant = msg.sender === "assistant";
            return (
              <div
                key={idx}
                className={`flex max-w-[85%] flex-col ${isAssistant ? "items-start self-start" : "items-end self-end"}`}
              >
                <span className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-faint">
                  {isAssistant ? "Swaram" : "You"}
                </span>
                <div className={`bubble ${isAssistant ? "bubble-assistant" : "bubble-user"}`}>{msg.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
