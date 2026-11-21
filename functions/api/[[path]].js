// Forwards every /api/* request to the single Durable Object that holds all calendars.
export async function onRequest({ request, env }) {
  const stub = env.CALS.get(env.CALS.idFromName('main'));
  return stub.fetch(request);
}
