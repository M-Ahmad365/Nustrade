'use strict';

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ok, created, noContent } = require('../utils/response');
const queries                    = require('../db/queries/savedSearches');

/**
 * GET /api/v1/saved-searches — list current user's saved searches, newest first.
 */
const getSavedSearches = asyncHandler(async (req, res) => {
  const searches = await queries.getSavedSearches(req.user.user_id);
  return ok(res, { saved_searches: searches });
});

/**
 * POST /api/v1/saved-searches — create a named saved search with optional filters.
 */
const createSavedSearch = asyncHandler(async (req, res) => {
  const { name, query_text, filters_json } = req.body;
  const search = await queries.createSavedSearch({
    userId:      req.user.user_id,
    name,
    queryText:   query_text,
    filtersJson: filters_json,
  });
  return created(res, { saved_search: search }, 'Saved search created');
});

/**
 * DELETE /api/v1/saved-searches/:id — delete own saved search.
 */
const deleteSavedSearch = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, 'INVALID_ID', 'Invalid saved search ID');

  const deleted = await queries.deleteSavedSearch(id, req.user.user_id);
  if (!deleted) throw new AppError(404, 'NOT_FOUND', 'Saved search not found');

  return noContent(res);
});

module.exports = { getSavedSearches, createSavedSearch, deleteSavedSearch };
