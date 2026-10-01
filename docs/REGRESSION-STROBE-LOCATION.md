# Obstructed strobe: identity and localization regression

Original photo: 1e06b077-9a64-4ef3-8df2-05e9c3c4e323 in inspection 246f60ef-8301-46de-8539-3e60d63adda9.
User screenshot: C:/Users/stani/AppData/Local/Temp/codex-clipboard-0eade4ce-d6de-420c-84c9-fcbeecc09c9c.png.
Inspector identifies the red FIRE-marked device partly behind the TV as a fire alarm strobe.

Expected title: Fire alarm strobe obstructed by television.
Brief annotation: TV obstructs strobe.
Description must address visual notification obstruction, not manual activation access.

Localization acceptance: box encloses the visible red device beside/behind the TV, with modest padding, and does not sit on empty wall above/right. Ground truth must be drawn on the clean original image; screenshot coordinates and the old model box are not ground truth. Check identical placement at analysis, display, and report sizes, including image orientation and aspect-ratio handling. Prompt edits alone do not establish coordinate accuracy.

Test original without context (strobe if recognizable, otherwise uncertain fire alarm device) and with inspector-confirmed strobe context. Include recognizable pull station and unobstructed strobe controls. Reject summaries or remediation that retain the incorrect device type. No live model retest or saved-record correction completed yet.
