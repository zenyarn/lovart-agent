import { it, expect, vi } from 'vitest';
import { agentEventStream } from '../agent/event-stream';
it('streams persisted events and stops reading after disconnect',async()=>{
 vi.useFakeTimers();
 const load=vi.fn().mockResolvedValue({runs:[{events:[{type:'text',delta:'hello'}]}]});
 const abort=new AbortController();
 const reader=agentEventStream(load,abort.signal).getReader();
 const first=await reader.read();
 expect(new TextDecoder().decode(first.value)).toContain('data: {"runs"');
 await reader.cancel();
 await vi.advanceTimersByTimeAsync(5000);
 expect(load).toHaveBeenCalledTimes(1);
 vi.useRealTimers();
});
