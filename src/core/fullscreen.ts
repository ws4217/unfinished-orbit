/** Must be invoked synchronously from the Enter/click handler; rejection is nonfatal. */
export async function requestFullscreen(target: { requestFullscreen?: () => Promise<void> }): Promise<boolean> {
  try {
    if (!target.requestFullscreen) return false;
    await target.requestFullscreen();
    return true;
  } catch { return false; }
}
