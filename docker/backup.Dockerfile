# The backup helper: the same PostgreSQL 16 as the database, plus the two scripts below.
# It makes the backups the app asks for (Admin → Backups) and restores one when told to.
FROM postgres:16-alpine
COPY docker/backup-worker.sh /usr/local/bin/backup-worker
COPY docker/restore.sh /usr/local/bin/restore
RUN chmod +x /usr/local/bin/backup-worker /usr/local/bin/restore
CMD ["backup-worker"]
