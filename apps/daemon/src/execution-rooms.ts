/** Private execution is inspected only through its scoped result projection. */
export const isPrivateExecutionRoom = (id: string): boolean => id === '_proactive' || id.startsWith('_investigation-') || id.startsWith('_agent-request-');
