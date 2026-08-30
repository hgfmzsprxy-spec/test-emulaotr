"use strict";

const server = require("../server");

module.exports = function vercelHandler(req, res) {
  server.emit("request", req, res);
};
