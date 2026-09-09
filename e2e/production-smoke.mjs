import assert from "node:assert/strict";
import {chromium} from "@playwright/test";
const origin=process.env.TEST_ORIGIN??"http://127.0.0.1:4180";
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});const failures=[];page.on("pageerror",error=>failures.push(error.message));
 await page.goto(origin+"/demo");await page.getByRole("heading",{name:"Try an inspection workflow"}).waitFor();
 await page.goto(origin);await page.getByRole("link",{name:"Try the free example"}).waitFor();await page.screenshot({path:"test-results/landing-mobile.png",fullPage:true});
 for(const route of ["/assets","/schedules","/usage"]){await page.goto(origin+route);await page.waitForURL("**/login**");}
 for(const route of ["/api/photos/upload","/api/photos/00000000-0000-0000-0000-000000000001/coach","/api/photos/00000000-0000-0000-0000-000000000001/deep-questions","/api/photos/00000000-0000-0000-0000-000000000001/reanalyze","/api/photos/00000000-0000-0000-0000-000000000001/status"]){const response=await page.request.post(origin+route,{data:{text:"Inspect the exit route",tier:"default"}});assert.equal(response.status(),401,route);}
 const response=await page.request.get(origin+"/demo");assert(response.headers()["content-security-policy"].includes("worker-src 'self' blob:"));assert(!response.headers()["content-security-policy"].includes("cdnjs"));
 assert.deepEqual(failures,[]);console.log("PASS: production landing/demo render, private pages require login, all five paid/mutating photo routes reject guests, CSP serves PDF worker locally, no browser errors");
} finally {await browser.close();}
