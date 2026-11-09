// Embedded DSH build: transports are supplied by the plugin. Never load desktop IPC.
export function createTransportRegistry(){return new Map<string,any>()}
