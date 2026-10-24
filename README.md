# Crimson Chat — screenshot-style version

This is a working, mobile-friendly browser chat for up to three people. It uses the red-and-black, square-edged design shown in the three screenshots. **There is no live map service or geographic data**: the map is the cleaned-up picture provided by the user. Markers and paths are positions on that picture.

## Contents

- `public/index.html` — the public, private, and map screens
- `public/style.css` — sharp rectangular red-and-black styling
- `public/app.js` — chat and map interaction
- `public/map-image.png` — cropped/assembled picture from the user's sketch
- `server.js` — Express and Socket.IO real-time server with separate public and private rooms
- `package.json` — required Node.js packages

## Set up online with GitHub and Render

1. Extract the ZIP.
2. Create a GitHub repository at https://github.com/new.
3. Upload `server.js`, `package.json`, and the entire `public` folder **with its folder name**. You may also upload this README.
4. In https://dashboard.render.com choose **New > Web Service**, connect your GitHub repository.
5. Choose **Node**, build command `npm install`, start command `npm start`. Use the Free instance if available.
6. Deploy. Once the service is Live, open its `https://...onrender.com` address from your phone or computer and share that same address with two other people.

## Local testing (optional)

You can also use `npm install` then `npm start` on a computer. The website is at `http://localhost:3000`. `localhost` is not a public address, so use Render when chatting across phones.

## Use the website

- Enter a display name to join (3 users max).
- When you join, the public chat is open. Tap someone else's name at the top to open the private chat. Your own name tab takes you to the public chat; the back arrow also returns from a private chat to public.
- Tap the three white bars in the top-right to open the map in the **current** conversation.
- In the map, click **mark area**, tap the picture, enter a note, and press **save**.
- Or click **path**, tap at least two points (up to 30), press **finish**, optionally enter a note, and **save**. Use **undo** and **cancel** as needed.
- Tap any saved dot or line waypoint to reveal its message bubble. Tap an item in the saved-items list to show its bubble. You can delete only your own items.
- Public chat map items are accessible to all three people. Private chat map items are sent only to the two people involved; the server enforces the separation.

## Notes

The three slots count connected users, not permanent user accounts. No sign-in/passwords or message encryption are implemented, so do not use this for sensitive information. Chat and map data live in server memory and may be cleared on restart. When a user disconnects, their private-chat session is removed. Render's free plan can sleep when unused.
