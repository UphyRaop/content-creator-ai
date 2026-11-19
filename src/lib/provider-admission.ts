/** Current deployment has no trusted telemetry or durable job reconciler. Only simulation may run. */
export function providerAdmissionBlock(providerId:string):string|null {
  return providerId==="simulated"?null:"Live provider execution is blocked until metered admission and durable job reconciliation are active.";
}

/** Process-local queues and files are not durable on Cloud Run; reject until cloud job/storage adapters exist. */
export function cloudRenderAdmissionBlock(env:Record<string,string|undefined>):string|null {
  return env.K_SERVICE||env.K_JOB?"Cloud rendering is blocked until durable job records, media storage, usage reservations, and reconciliation are active.":null;
}
