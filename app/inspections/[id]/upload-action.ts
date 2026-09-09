"use server";

export type UploadResult = {ok:true;photoId:string}|{ok:false;error:string};
/** Retired synchronous uploader. All captures use the authenticated queue/manual API. */
export async function uploadAndAnalyzePhoto():Promise<UploadResult> {
 return {ok:false,error:"This uploader has been replaced. Reload the inspection and use Add photos."};
}
