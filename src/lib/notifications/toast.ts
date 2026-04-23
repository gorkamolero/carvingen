"use client";

import { toast } from "sonner";

type ToastId = string | number;

type ToastCopy = {
  title: string;
  description?: string;
};

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

export function showLoadingToast(copy: ToastCopy) {
  return toast.loading(copy.title, {
    description: copy.description,
  });
}

export function showSuccessToast(id: ToastId | undefined, copy: ToastCopy) {
  toast.success(copy.title, {
    id,
    description: copy.description,
  });
}

export function showErrorToast(id: ToastId | undefined, copy: ToastCopy) {
  toast.error(copy.title, {
    id,
    description: copy.description,
  });
}
