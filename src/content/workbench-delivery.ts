/**
 * The messages between the workbench and a game page it opens on its build: the page asks with `{type:
 * WORKBENCH_REQUEST}`, and the workbench answers with `{type: WORKBENCH_DELIVERY, files}`, each delivered file's
 * `[path, bytes]` and `manifest.json` in the delivery layout.
 */
export const WORKBENCH_REQUEST = 'superoutride.workbench-delivery-request';
export const WORKBENCH_DELIVERY = 'superoutride.workbench-delivery';
