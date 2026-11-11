import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {ffmpegPath as ffmpeg} from 'ffmpeg-ffprobe-static';

export function videoFixture(run,{codec='libx264',faststart=true,name='video-fictive.mp4'}={}) {
 const filename=path.join(run,name);
 execFileSync(ffmpeg,['-v','error','-nostdin','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','12','-c:v',codec,...(codec==='libx264'?['-preset','ultrafast','-pix_fmt','yuv420p']:[]),'-c:a','aac',...(faststart?['-movflags','+faststart']:[]),'-y',filename],{windowsHide:true,timeout:60000,maxBuffer:1048576});
 return filename;
}
