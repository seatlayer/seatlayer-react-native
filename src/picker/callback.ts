/** Delivers a host notification without allowing user code to reject the SDK. */
export function invokeSeatLayerPickerCallback<Argument>(
  callback: ((argument: Argument) => void) | undefined,
  argument: Argument,
  reportError: (error: unknown) => void,
): void {
  if (callback === undefined) return;
  try {
    const result = callback(argument) as unknown;
    void Promise.resolve(result).catch(reportError);
  } catch (error) {
    reportError(error);
  }
}
