import type { Page } from 'puppeteer';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SessionError } from './results.js';

export function checkImageBounds(width: number, height: number, scale: number, bytes = 0): void {
  const pixels = Math.ceil(width * scale) * Math.ceil(height * scale);
  if (!(width > 0 && height > 0 && scale > 0) || !Number.isSafeInteger(pixels) || pixels > 16_000_000 || bytes > 5 * 1024 * 1024) {
    throw new SessionError('limit');
  }
}

// Read the frame header of Chrome's JPEG; layout can change after the preflight.
function jpegDimensions(bytes: Buffer): [number,number] {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) throw new SessionError('failed');
  for (let i=2; i+4<=bytes.length;) {
    if (bytes[i++] !== 0xff) break;
    while(bytes[i]===0xff) i++;
    const marker=bytes[i++]; if (marker===0xda || marker===0xd9 || i+2>bytes.length) break;
    const length=bytes.readUInt16BE(i); if(length<2 || i+length>bytes.length) break;
    if ((marker===0xc0 || marker===0xc1 || marker===0xc2) && length>=8) return [bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)];
    i+=length;
  }
  throw new SessionError('failed');
}
export async function capture(page:Page, options:{selector?:string;full_page?:boolean}, signal:AbortSignal, tabId?:string): Promise<CallToolResult> {
  await using element=options.selector ? await page.waitForSelector(options.selector,{visible:true,timeout:0,signal}) : null;
  const bounds=await page.evaluate((full)=>({width:full ? Math.max(innerWidth,document.documentElement.scrollWidth) : innerWidth,
    height:full ? Math.max(innerHeight,document.documentElement.scrollHeight) : innerHeight, scale:devicePixelRatio}),!!options.full_page);
  const rect=element ? await element.boundingBox() : bounds;
  if(!rect) throw new SessionError('failed');
  checkImageBounds(rect.width,rect.height,bounds.scale);
  signal.throwIfAborted();
  const imageOptions={type:'jpeg',quality:80} as const;
  const image=element ? await element.screenshot(imageOptions) : await page.screenshot({...imageOptions,fullPage:!!options.full_page});
  const bytes=Buffer.from(image.buffer,image.byteOffset,image.byteLength);
  const [width,height]=jpegDimensions(bytes); checkImageBounds(width,height,1,bytes.length);
  return {content:[{type:'image',mimeType:'image/jpeg',data:bytes.toString('base64')}],
    structuredContent:{tab_id:tabId,width,height,bytes:bytes.length}};
}
