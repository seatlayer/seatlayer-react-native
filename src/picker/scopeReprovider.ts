/** Keeps a modal under the exact existing scope object, never a cloned session. */
export function reprovideSeatLayerPickerScopeValue<Value>(value: Value): Value {
  return value;
}
