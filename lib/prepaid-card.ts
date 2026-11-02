export function isScheduledPrepaidExpense(movement: {
  kind: string;
  person: string;
  commonAccount?: string | null;
  scheduleId?: number | null;
}) {
  return Boolean(movement.scheduleId && movement.kind === "Spesa" && movement.person !== "Comune" &&
    (movement.commonAccount === "Ricaricabile BPER" || movement.commonAccount === "PREPAGATA Mediolanum"));
}
