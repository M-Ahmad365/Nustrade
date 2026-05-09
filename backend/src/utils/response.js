'use strict';

/** 200 OK — for successful GET / PATCH */
const ok = (res, data = null, message = null) => {
  const body = { success: true, data };
  if (message) body.message = message;
  return res.status(200).json(body);
};

/** 201 Created — for successful POST that creates a resource */
const created = (res, data = null, message = null) => {
  const body = { success: true, data };
  if (message) body.message = message;
  return res.status(201).json(body);
};

/** 204 No Content — for successful DELETE */
const noContent = (res) => res.status(204).send();

module.exports = { ok, created, noContent };
