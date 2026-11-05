/* eslint-disable */
  /**
   * Generated `api` utility.
   *
   * THIS CODE IS AUTOMATICALLY GENERATED.
   *
   * To regenerate, run `npx convex dev`.
   * @module
   */
  
  import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
  import type * as activities from "../activities.js";
import type * as ai from "../ai.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_fakeData from "../lib/fakeData.js";
import type * as lib_insertTripTree from "../lib/insertTripTree.js";
import type * as lib_modelRouter from "../lib/modelRouter.js";
import type * as lib_photos from "../lib/photos.js";
import type * as lib_tree from "../lib/tree.js";
import type * as lib_tripSchema from "../lib/tripSchema.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_wikiPhotos from "../lib/wikiPhotos.js";
import type * as photos from "../photos.js";
import type * as seed from "../seed.js";
import type * as trips from "../trips.js";
import type * as users from "../users.js";

  /**
   * A utility for referencing Convex functions in your app's API.
   *
   * Usage:
   * ```js
   * const myFunctionReference = api.myModule.myFunction;
   * ```
   */
  declare const fullApi: ApiFromModules<{
    "activities": typeof activities,
"ai": typeof ai,
"lib/auth": typeof lib_auth,
"lib/categories": typeof lib_categories,
"lib/fakeData": typeof lib_fakeData,
"lib/insertTripTree": typeof lib_insertTripTree,
"lib/modelRouter": typeof lib_modelRouter,
"lib/photos": typeof lib_photos,
"lib/tree": typeof lib_tree,
"lib/tripSchema": typeof lib_tripSchema,
"lib/types": typeof lib_types,
"lib/validators": typeof lib_validators,
"lib/wikiPhotos": typeof lib_wikiPhotos,
"photos": typeof photos,
"seed": typeof seed,
"trips": typeof trips,
"users": typeof users,
  }>;
  export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
  export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
  