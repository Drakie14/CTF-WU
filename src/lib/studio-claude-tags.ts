import { spawn } from 'node:child_process';
import { TAG_SYSTEM, parseTagDifficulty, parseTagReason, parseTagReply, parseTagSummary, tagPromptData, type TagPromptInput } from './tag-prompt';
import type { GeminiTagResult } from './studio-gemini-tags';

/** Model Claude Code dùng khi chấm: alias luôn trỏ bản mới nhất mà gói Pro được dùng. */
export const CLAUDE_MODEL = 'sonnet';
const TIMEOUT_MS = 180_000;

/**
 * Chỉ chạy trong Node (middleware của `npm run dev`): mở một session `claude -p` mới, dùng tài khoản
 * Claude Code đã đăng nhập trên máy (gói Pro), không tool, không lưu session. Prompt giống hệt bản gửi Gemini.
 */
export function claudeSuggestTags(input: TagPromptInput, cwd: string): Promise<GeminiTagResult> {
  const args = ['-p', '--output-format', 'json', '--model', CLAUDE_MODEL, '--system-prompt', TAG_SYSTEM, '--tools', '', '--no-session-persistence'];
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Claude quá lâu không trả lời.')); }, TIMEOUT_MS);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(new Error(`Không chạy được lệnh claude (${error.message}).`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let reply: { result?: string; is_error?: boolean };
      try { reply = JSON.parse(stdout) as typeof reply; } catch { return reject(new Error(`Claude lỗi (exit ${code}): ${(stderr || stdout).trim().slice(0, 300)}`)); }
      if (reply.is_error || typeof reply.result !== 'string') return reject(new Error(`Claude lỗi: ${String(reply.result ?? stderr).slice(0, 300)}`));
      const text = reply.result;
      const tags = parseTagReply(text);
      if (!tags.length) return reject(new Error('Claude không trả tag.'));
      const difficulty = parseTagDifficulty(text);
      const difficultyReason = parseTagReason(text);
      const summary = parseTagSummary(text);
      resolve({ tags, model: `Claude ${CLAUDE_MODEL}`, ...(difficulty ? { difficulty } : {}), ...(difficulty && difficultyReason ? { difficultyReason } : {}), ...(summary ? { summary } : {}) });
    });
    child.stdin.end(tagPromptData(input));
  });
}
