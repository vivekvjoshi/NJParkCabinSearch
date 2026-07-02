import nj from '../../src/njoutdoors.js';

export const config = { path: '/api/meta' };

export default async () => {
  const { types, features } = nj.metaFromCatalogs();
  return Response.json({
    parks: Object.entries(nj.PARKS).map(([id, name]) => ({ id: Number(id), name })),
    types,
    features,
    minStayTypeIds: nj.MIN_STAY_TYPE_IDS,
    showerFeatureId: nj.SHOWER_FEATURE_ID,
    today: nj.todayISO(),
    nlEnabled: Boolean(process.env.NVIDIA_API_KEY),
    serverless: true, // tells the frontend to fan out per-park fetches instead of SSE
  });
};
