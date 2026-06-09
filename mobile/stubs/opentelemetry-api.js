// Stub untuk @opentelemetry/api — tidak dipakai di React Native/Expo
module.exports = {
  trace: { getTracer: () => ({}) },
  context: {},
  propagation: {},
  diag: { setLogger: () => {}, createNoopMeter: () => ({}) },
  metrics: { getMeter: () => ({}) },
  SpanStatusCode: {},
  SpanKind: {},
};
