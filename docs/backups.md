# Backups

Edubotics One makes a full copy of itself every day on the office computer: every record and every uploaded file (documents, receipts, resumes, photos, signatures all live inside the database, so one file holds everything). Admins see the backups under **Admin > Backups**.

## What happens on its own

- **Every day at 5 PM** (India time) a backup is saved. If the computer was off at 5 PM, it is made as soon as Edubotics One is running again.
- Each backup is **checked** right after it is made: a file that doesn't open completely is thrown away and the failure is shown.
- **Kept:** every backup from the last 30 days, then the first backup of each month for 12 months. Older ones are removed after each new backup.
- Admins see a red or amber line on **Home** if the last backup failed, the newest one is more than 2 days old, or the backup helper has stopped.

You can change the time and how long backups are kept under **Admin > Backups**, and make one straight away with **Back up now** (for example before a big change, or before an update).

The backups are files named like `edubotics-one-2026-10-07-1700.dump`, in the `backups` folder inside the Edubotics One folder.

## Keep a copy off this computer

A backup on the same computer won't help if the computer is stolen or its disk fails. Do one of these.

### Automatically, into a second folder

Every backup is also copied into a second folder you name. A good choice is a folder that **Google Drive for desktop** or **OneDrive** keeps in sync, so the copy also ends up online in your own account. Nothing is sent anywhere unless you set this up.

1. Make the folder, for example `Edubotics backups` inside your Google Drive folder.
   - Google Drive for desktop: in its settings, choose **Mirror files** for My Drive. Then My Drive is an ordinary folder, usually `C:\Users\<you>\My Drive`. (With "Stream files" it is a G: drive, which Docker may not be able to see.)
2. In the Edubotics One folder, make a file called `.env` (no name before the dot) with Notepad, containing one line with your folder, using forward slashes:

   ```
   BACKUP_COPY_FOLDER=C:/Users/Ethen/My Drive/Edubotics backups
   ```

   On a Mac: `BACKUP_COPY_FOLDER=/Users/ethen/Google Drive/My Drive/Edubotics backups`
3. In a command window in the Edubotics One folder, run `docker compose up -d`.
4. Open **Admin > Backups** and press **Back up now**. The backup should show **Copied**.

Don't use a USB drive that you unplug as the second folder: if it is missing when the computer starts, Edubotics One can't start either. For a USB drive, use the next way.

You can also move the main backups folder somewhere else with a `BACKUP_FOLDER=...` line in the same `.env` file.

### By hand, onto a USB drive

Once a week, open **Admin > Backups**, press **Download** on the newest backup and save the file to a USB drive or another laptop. Downloads are recorded in the activity log.

**Keep the copies private.** A backup holds everyone's salaries, documents, phone numbers and the login details. Keep the USB drive locked away and the cloud folder in an account only you use.

## Bring a backup back (restore)

This puts every record back the way it was when the backup was made. Anything entered after that is lost. Just before it restores, it saves one more backup of how things are now (named `...-before-restore.dump`), so the restore itself can be undone by restoring that file.

On the office computer, open a command window in the Edubotics One folder (step 3 of the setup guide) and run these three commands, one at a time:

1. Stop the app:

   ```
   docker compose stop app
   ```

2. Restore, using the name of the backup you want (see **Admin > Backups**, or the backups folder):

   ```
   docker compose run --rm backup restore edubotics-one-2026-10-07-1700.dump
   ```

   It checks the file, then asks you to type `yes`. It either restores everything or, if anything goes wrong, changes nothing.

3. Start the app again:

   ```
   docker compose start app
   ```

Everyone signs in again afterwards. If the backup is from an older version of Edubotics One, it is brought up to date automatically when the app starts.

The file can be in the backups folder or the second folder. If it is on a USB drive, copy it into the `backups` folder first.

### On a new computer

If the office computer is lost: set up Edubotics One on the new computer (the setup guide, steps 1 to 4), copy your backup file into its `backups` folder, then run the three commands above. Two things need entering again afterwards, because they are locked to the old computer: the email password (Admin > Settings > Email) and the Google sign-in client secret, if you use Google sign-in.

## If something is wrong

- **"The backup helper isn't running"**: open a command window in the Edubotics One folder and run `docker compose up -d`.
- **"The last backup failed"**: press **Back up now**. If it fails again, check the computer has free disk space and Docker Desktop is running.
- **"Not restored: the app is still running"**: run `docker compose stop app` first.
