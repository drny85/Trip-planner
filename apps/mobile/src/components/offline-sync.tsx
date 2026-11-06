import { api } from "@trip/backend/api";
import type { PendingCheck } from "@trip/backend/offline";
import { useI18n } from "@trip/i18n/react";
import { useConvex, useConvexAuth } from "convex/react";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useIsOffline } from "@/hooks/use-cached-query";
import { outbox, useOutbox } from "@/lib/outbox";

/** Sends the outbox once signed in (with Clerk on). useConvexAuth only works under ConvexProviderWithClerk. */
export function OfflineSyncWhenSignedIn() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return <OfflineSync ready={!isLoading && isAuthenticated} />;
}

/**
 * Replays check-offs made offline, oldest first, as soon as there's a
 * connection. One the server turns down (the trip was locked or the stop was
 * deleted meanwhile) is dropped, and the person is told once.
 */
export function OfflineSync({ ready }: { ready: boolean }) {
  const convex = useConvex();
  const offline = useIsOffline();
  const { queue } = useOutbox();
  const { t } = useI18n();
  const running = useRef(false);
  // Bumped after a run, so taps made while it was sending go out too.
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!ready || offline || queue.length === 0 || running.current) return;
    running.current = true;
    void (async () => {
      let sent = 0;
      const refused: string[] = [];
      for (const op of [...outbox.get().queue]) {
        try {
          await send(convex, op);
          sent++;
        } catch (e) {
          refused.push(serverMessage(e) ?? t("common.somethingWrong"));
        }
        // Settled either way: the server has it, or will never take it.
        outbox.settle(op);
      }
      if (sent > 0) {
        outbox.synced(sent);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      if (refused.length > 0) Alert.alert(t("offline.notSaved", { count: refused.length }), refused[0]);
    })().finally(() => {
      running.current = false;
      setRound((r) => r + 1);
    });
  }, [ready, offline, queue, round, convex, t]);

  return null;
}

function send(convex: ReturnType<typeof useConvex>, op: PendingCheck) {
  // A mutation made while the socket is down waits for it to come back rather than failing.
  return op.kind === "activity"
    ? convex.mutation(api.activities.setCompleted, { activityId: op.activityId, isCompleted: op.isCompleted })
    : convex.mutation(api.packing.toggle, { itemId: op.itemId, isPacked: op.isPacked });
}

/** The readable part of a Convex error ("Uncaught Error: …"). */
function serverMessage(e: unknown) {
  if (!(e instanceof Error)) return undefined;
  return e.message.match(/Uncaught Error: (.*?)(\n|$)/)?.[1] ?? undefined;
}
