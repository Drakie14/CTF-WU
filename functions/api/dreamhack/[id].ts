import { dreamhackProxy } from '../../../src/lib/dreamhack';

/** Cloudflare Pages Function: GET /api/dreamhack/<id> cho Studio bản deploy lấy độ khó chính thức của challenge. */
export const onRequestGet = ({ params }: { params: { id?: string | string[] } }) => dreamhackProxy(String(params.id ?? ''));
