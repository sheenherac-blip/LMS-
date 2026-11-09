-- Run order: 00 -> 13 (see README). Extensions and ID sequences.
create extension if not exists pgcrypto;

create sequence if not exists seq_admin;
create sequence if not exists seq_teacher;
create sequence if not exists seq_student;
