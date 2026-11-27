import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({getUser:vi.fn(), signUp:vi.fn()}));
vi.mock('../supabase/server',()=>({sessionClient:async()=>({auth:mocks})}));
import { requireOwner } from '../auth';
import { POST } from '../../app/api/auth/login/route';
beforeEach(()=>{vi.stubEnv('APP_OWNER_EMAILS','old-owner@example.com');vi.stubEnv('APP_URL','http://localhost:3000');});
it('allows a verified email outside the historical whitelist',async()=>{
 mocks.getUser.mockResolvedValue({data:{user:{id:'new-user',email:'new@example.com',email_confirmed_at:'2026-11-21'}},error:null});
 expect((await requireOwner()).id).toBe('new-user');
});
it('rejects an unverified email even with a valid session',async()=>{
 mocks.getUser.mockResolvedValue({data:{user:{id:'new-user',email:'new@example.com'}},error:null});
 await expect(requireOwner()).rejects.toThrow();
});
it('accepts public signup and explains email verification',async()=>{
 mocks.signUp.mockResolvedValue({error:null});
 const response=await POST(new Request('http://localhost:3000/api/auth/login',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'new@example.com',password:'strong-pass-123',action:'signup'})}));
 expect(response.status).toBe(200);
 expect((await response.json()).message).toContain('邮箱');
});
it('redirects straight into the app when signup returns an authenticated session',async()=>{
 mocks.signUp.mockResolvedValue({data:{session:{access_token:'test'},user:{email_confirmed_at:'2026-11-27'}},error:null});
 const response=await POST(new Request('http://localhost:3000/api/auth/login',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'new@example.com',password:'strong-pass-123',action:'signup',next:'/projects'})}));
 expect(response.status).toBe(200);
 expect((await response.json()).redirect).toBe('/projects');
});
