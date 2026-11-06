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
import type * as billing from "../billing.js";
import type * as alerts from "../alerts.js";
import type * as bookings from "../bookings.js";
import type * as crons from "../crons.js";
import type * as expenses from "../expenses.js";
import type * as fares from "../fares.js";
import type * as fx from "../fx.js";
import type * as http from "../http.js";
import type * as groupVotes from "../groupVotes.js";
import type * as journal from "../journal.js";
import type * as lib_alerts from "../lib/alerts.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_billing from "../lib/billing.js";
import type * as lib_bookings from "../lib/bookings.js";
import type * as lib_webhook from "../lib/webhook.js";
import type * as lib_budget from "../lib/budget.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_fakeData from "../lib/fakeData.js";
import type * as lib_fares from "../lib/fares.js";
import type * as lib_fx from "../lib/fx.js";
import type * as lib_googlePlaces from "../lib/googlePlaces.js";
import type * as places from "../places.js";
import type * as lib_insertTripTree from "../lib/insertTripTree.js";
import type * as lib_interview from "../lib/interview.js";
import type * as lib_localPick from "../lib/localPick.js";
import type * as localPicks from "../localPicks.js";
import type * as lib_majority from "../lib/majority.js";
import type * as lib_groupVotes from "../lib/groupVotes.js";
import type * as lib_members from "../lib/members.js";
import type * as lib_modelRouter from "../lib/modelRouter.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_photos from "../lib/photos.js";
import type * as lib_promptAnswer from "../lib/promptAnswer.js";
import type * as lib_promptBrief from "../lib/promptBrief.js";
import type * as lib_replan from "../lib/replan.js";
import type * as lib_settle from "../lib/settle.js";
import type * as lib_splitDraft from "../lib/splitDraft.js";
import type * as lib_story from "../lib/story.js";
import type * as lib_subtree from "../lib/subtree.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_tree from "../lib/tree.js";
import type * as lib_tripSchema from "../lib/tripSchema.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_upNext from "../lib/upNext.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_wikiPhotos from "../lib/wikiPhotos.js";
import type * as members from "../members.js";
import type * as memories from "../memories.js";
import type * as notifications from "../notifications.js";
import type * as packing from "../packing.js";
import type * as photos from "../photos.js";
import type * as prompts from "../prompts.js";
import type * as push from "../push.js";
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
"billing": typeof billing,
"alerts": typeof alerts,
"bookings": typeof bookings,
"crons": typeof crons,
"expenses": typeof expenses,
"fares": typeof fares,
"fx": typeof fx,
"http": typeof http,
"groupVotes": typeof groupVotes,
"journal": typeof journal,
"lib/alerts": typeof lib_alerts,
"lib/auth": typeof lib_auth,
"lib/billing": typeof lib_billing,
"lib/bookings": typeof lib_bookings,
"lib/webhook": typeof lib_webhook,
"lib/budget": typeof lib_budget,
"lib/categories": typeof lib_categories,
"lib/fakeData": typeof lib_fakeData,
"lib/fares": typeof lib_fares,
"lib/fx": typeof lib_fx,
"lib/googlePlaces": typeof lib_googlePlaces,
"lib/insertTripTree": typeof lib_insertTripTree,
"lib/interview": typeof lib_interview,
"lib/localPick": typeof lib_localPick,
"lib/majority": typeof lib_majority,
"lib/groupVotes": typeof lib_groupVotes,
"lib/members": typeof lib_members,
"lib/modelRouter": typeof lib_modelRouter,
"lib/notify": typeof lib_notify,
"lib/photos": typeof lib_photos,
"lib/promptAnswer": typeof lib_promptAnswer,
"lib/promptBrief": typeof lib_promptBrief,
"lib/replan": typeof lib_replan,
"lib/settle": typeof lib_settle,
"lib/splitDraft": typeof lib_splitDraft,
"lib/story": typeof lib_story,
"lib/subtree": typeof lib_subtree,
"lib/tokens": typeof lib_tokens,
"lib/tree": typeof lib_tree,
"lib/tripSchema": typeof lib_tripSchema,
"lib/types": typeof lib_types,
"lib/upNext": typeof lib_upNext,
"lib/validators": typeof lib_validators,
"lib/wikiPhotos": typeof lib_wikiPhotos,
"localPicks": typeof localPicks,
"members": typeof members,
"memories": typeof memories,
"notifications": typeof notifications,
"packing": typeof packing,
"photos": typeof photos,
"places": typeof places,
"prompts": typeof prompts,
"push": typeof push,
"seed": typeof seed,
"suggestions": typeof suggestions,
"trips": typeof trips,
"users": typeof users,
  }>;
  export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
  export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
  