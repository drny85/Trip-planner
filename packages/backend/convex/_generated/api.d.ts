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
import type * as lib_budget from "../lib/budget.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_fakeData from "../lib/fakeData.js";
import type * as lib_insertTripTree from "../lib/insertTripTree.js";
import type * as lib_majority from "../lib/majority.js";
import type * as lib_members from "../lib/members.js";
import type * as lib_modelRouter from "../lib/modelRouter.js";
import type * as lib_photos from "../lib/photos.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_tree from "../lib/tree.js";
import type * as lib_tripSchema from "../lib/tripSchema.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_upNext from "../lib/upNext.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_wikiPhotos from "../lib/wikiPhotos.js";
import type * as members from "../members.js";
import type * as memories from "../memories.js";
import type * as photos from "../photos.js";
import type * as seed from "../seed.js";
import type * as suggestions from "../suggestions.js";
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
"lib/budget": typeof lib_budget,
"lib/categories": typeof lib_categories,
"lib/fakeData": typeof lib_fakeData,
"lib/insertTripTree": typeof lib_insertTripTree,
"lib/majority": typeof lib_majority,
"lib/members": typeof lib_members,
"lib/modelRouter": typeof lib_modelRouter,
"lib/photos": typeof lib_photos,
"lib/tokens": typeof lib_tokens,
"lib/tree": typeof lib_tree,
"lib/tripSchema": typeof lib_tripSchema,
"lib/types": typeof lib_types,
"lib/upNext": typeof lib_upNext,
"lib/validators": typeof lib_validators,
"lib/wikiPhotos": typeof lib_wikiPhotos,
"members": typeof members,
"memories": typeof memories,
"photos": typeof photos,
"seed": typeof seed,
"suggestions": typeof suggestions,
"trips": typeof trips,
"users": typeof users,
  }>;
  export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
  export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
  