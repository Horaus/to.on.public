const { EventEmitter } = require("node:events");

function createStore(initialState) {
  const events = new EventEmitter();
  let current = initialState;
  let revision = 0;

  function replace(nextState, metadata = {}) {
    if (!nextState || typeof nextState !== "object") throw new TypeError("State store requires an object state.");
    current = nextState;
    revision += 1;
    events.emit("change", { state: current, revision, kind: "replace", ...metadata });
    return current;
  }

  function mutate(mutator, metadata = {}) {
    if (typeof mutator !== "function") throw new TypeError("State mutation requires a function.");
    mutator(current);
    revision += 1;
    events.emit("change", { state: current, revision, kind: "mutate", ...metadata });
    return current;
  }

  function touch(metadata = {}) {
    revision += 1;
    events.emit("change", { state: current, revision, kind: "touch", ...metadata });
  }

  return {
    get: () => current,
    revision: () => revision,
    replace,
    mutate,
    touch,
    onChange(listener) {
      events.on("change", listener);
      return () => events.off("change", listener);
    }
  };
}

module.exports = { createStore };
