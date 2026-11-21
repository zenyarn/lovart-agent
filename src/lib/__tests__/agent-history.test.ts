import { it, expect } from 'vitest';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { recoverTranscript } from '../agent/history';
it('preserves a completed paid tool when the final assistant response fails', () => {
 const messages = [{role:'assistant',stopReason:'toolUse',content:[{type:'toolCall',id:'a',name:'generate_image',arguments:{}}]}, {role:'toolResult',toolCallId:'a',toolName:'generate_image',isError:false,content:[{type:'text',text:'succeeded'}]}, {role:'assistant',stopReason:'error',content:[]}] as AgentMessage[];
 expect(recoverTranscript(messages)).toEqual(messages.slice(0,2));
});
it('closes interrupted tool calls with an explicit unknown result', () => {
 const messages = [{role:'assistant',stopReason:'toolUse',content:[{type:'toolCall',id:'a',name:'generate_image',arguments:{}}]}] as AgentMessage[];
 expect(recoverTranscript(messages)[1]).toMatchObject({role:'toolResult',toolCallId:'a',isError:true});
});
