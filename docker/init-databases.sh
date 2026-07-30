#!/bin/sh
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE loyalty_dev;
  CREATE DATABASE loyalty_test;
EOSQL
