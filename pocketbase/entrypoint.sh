#!/bin/sh
set -eu

/pb/pocketbase migrate up
/pb/pocketbase configure-google-auth
exec /pb/pocketbase serve --http=0.0.0.0:8090
