import { describe, it, expect } from 'vitest';
import { githubCommitUrl, renderSessionEvidence } from '../public/session-evidence.js';
const hash='7f3dacc'.padEnd(40,'a');
const project={remote:'https://github.com/team/current.git'};
const session={startSnapshot:{remote:'git@github.com:team/original.git'}};
const sync={verified:{source:'agent_attested',commitEvidence:'explicit_range',startHead:'1234567',endHead:hash,commits:[{hash,shortHash:'7f3dacc',subject:'Restore timer',author:'Shani'}],changedFiles:['app.js']}};
describe('session commit navigation',()=>{
 it('uses the captured repository for historical handoffs',()=>{
   expect(githubCommitUrl(project,session,hash)).toBe('https://github.com/team/original/commit/'+hash);
   expect(githubCommitUrl(project,{},hash)).toBe('https://github.com/team/current/commit/'+hash);
 });
 it('supports GitHub SSH and HTTPS remotes and rejects unsafe or non-repository links',()=>{
   expect(githubCommitUrl({remote:'ssh://git@github.com/team/repo.git'},{},hash)).toBe('https://github.com/team/repo/commit/'+hash);
   for(const remote of ['javascript:alert(1)','https://token@github.com/team/repo','https://github.com/team/repo?token=x','https://github.com.evil.test/team/repo','https://github.com/team/repo/tree/main','/local/repo','https://github.com:444/team/repo']) expect(githubCommitUrl({remote},{},hash)).toBeNull();
   for(const invalid of ['../../settings','abc" onclick="alert(1)','HEAD','']) expect(githubCommitUrl(project,{},invalid)).toBeNull();
 });
 it('renders a named, new-tab link with authorship and full commit identity',()=>{
   const html=renderSessionEvidence(sync,{project,session});
   expect(html).toContain('href="https://github.com/team/original/commit/'+hash+'"');
   expect(html).toContain('View commit 7f3dacc on GitHub (opens in new tab)');
   expect(html).toContain('rel="noopener noreferrer"');
   expect(html).toContain('Git author: Shani');
   expect(html).toContain('About these commits');
 });
 it('does not manufacture real links or session work from sample and recent-context data',()=>{
   expect(renderSessionEvidence(sync,{project,session,sample:true})).not.toContain('href=');
   const context=renderSessionEvidence({verified:{...sync.verified,commitEvidence:'recent_context_only',unverifiedRecentCommits:sync.verified.commits}},{project,session});
   expect(context).toContain('not verified work from this session');
   expect(context).toContain('Recent repository commits');
 });
 it('handles unsynced and empty handoffs, and escapes imported commit text',()=>{
   expect(renderSessionEvidence(null)).toContain('No commits recorded yet');
   expect(renderSessionEvidence({verified:{commits:[]}})).toContain('No commits were recorded');
   const html=renderSessionEvidence({verified:{...sync.verified,commits:[{hash,subject:'<img src=x onerror=alert(1)>',author:'<script>bad</script>'}]}},{project});
   expect(html).not.toContain('<img');
   expect(html).not.toContain('<script>');
   expect(html).toContain('&lt;img');
 });
});
