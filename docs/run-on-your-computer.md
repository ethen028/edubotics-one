# Run Edubotics One on your own computer

This runs Edubotics One on one office computer, with no hosting. Anyone on the same office Wi-Fi can use it from their own laptop or phone.

**Good to know before you start**
- The computer that runs it must stay **on and awake** during office hours. If it is off, nobody can open the app.
- All data lives on that computer. Make a backup every week (see step 8).
- It only works inside the office network, not from home.

---

## 1. Install Docker Desktop (one time, about 10 minutes)

Docker Desktop is a free program that runs the app and its database for you.

- **Windows:** download it from https://www.docker.com/products/docker-desktop/ and run the installer. If it asks to turn on **WSL 2**, say yes, then restart the computer.
- **Mac:** download it from the same page. Pick **Apple chip** or **Intel chip**; the Apple menu > About This Mac tells you which you have. Drag it to Applications.

Open Docker Desktop once and wait until it says **Engine running** at the bottom left. Then, in its **Settings > General**, tick **Start Docker Desktop when you sign in to your computer**.

## 2. Download Edubotics One

1. Sign in to GitHub and open https://github.com/ethen028/edubotics-one
2. Click the green **Code** button, then **Download ZIP**.
3. Unzip it into your **Documents** folder. You'll have a folder named `edubotics-one-main`.

## 3. Open a command window in that folder

- **Windows:** open the `edubotics-one-main` folder. Click the address bar at the top, type `cmd` and press Enter.
- **Mac:** open the **Terminal** app. Type `cd ` (with a space after it), drag the `edubotics-one-main` folder into the Terminal window and press Enter.

## 4. Start it

Type this and press Enter:

```
docker compose up -d --build
```

The first time takes **5 to 10 minutes** while it downloads and builds. After that it starts in seconds. When the command finishes, you're ready.

## 5. Sign in

Open **http://localhost:3000** in your browser and sign in with:

- Email: `admin@edubotics.local`
- Password: `edubotics2026`

Then right away:
1. Go to **Admin > Users** and change this password.
2. Add your departments and people under **HR > People**. When you add someone, you can create their login, and they sign in with their work email.

## 6. Let staff use it from their laptops and phones

Find this computer's address on the office network:

- **Windows:** in the command window, type `ipconfig` and press Enter. Look for **IPv4 Address**, for example `192.168.1.25`.
- **Mac:** **System Settings > Wi-Fi > Details** next to your network. Look for **IP address**.

Staff on the same Wi-Fi open **http://192.168.1.25:3000**, using your number instead. They can bookmark it or add it to their phone's home screen.

If Windows asks whether to allow Docker on the network, choose **Allow** for **private networks**.

The address can change when the router restarts. To keep it fixed, ask whoever manages your router to "reserve" this computer's IP address. That is optional, but saves everyone updating their bookmark.

## 7. Every day

Nothing to do. When the computer starts and Docker Desktop opens, Edubotics One starts on its own.

To stop it, run `docker compose stop` in the folder. To start it again, run `docker compose up -d`.

## 8. Back up (once a week)

In the command window, inside the folder, run:

```
docker compose exec db pg_dump -U edubotics edubotics > backup.sql
```

This writes `backup.sql` in the folder. Copy it to Google Drive or a USB drive. Keep a few weeks of copies.

## 9. Getting a newer version

When there is an update, download the ZIP again (step 2) and unzip it over the old folder, or into a new one. Then run step 4 again. Your data is kept: it lives inside Docker, not in the folder.

---

**Something not working?**
- *"docker is not recognized"* or *"command not found"*: Docker Desktop isn't open yet. Open it, wait for **Engine running**, and try again.
- *Port 3000 is already in use*: another program uses that port. Restart the computer and try again.
- *Staff can't open the address*: check they're on the same Wi-Fi, that the computer is awake, and that the IP address hasn't changed (step 6).
