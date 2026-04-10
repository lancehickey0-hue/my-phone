import { ConvexReactClient } from 'convex/react';

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || 'https://quaint-kingfisher-867.convex.cloud';

export const convex = new ConvexReactClient(CONVEX_URL);
