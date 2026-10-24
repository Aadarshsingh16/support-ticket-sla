import { GraphQLError } from "graphql";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateRegistrationInput(name: string, email: string, password: string): {
  normalizedName: string;
  normalizedEmail: string;
} {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new GraphQLError("Name is required and cannot be blank.", {
      extensions: { code: "BAD_USER_INPUT", field: "name" },
    });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    throw new GraphQLError("Please provide a valid email address.", {
      extensions: { code: "BAD_USER_INPUT", field: "email" },
    });
  }

  if (!password || password.length < 8) {
    throw new GraphQLError("Password must be at least 8 characters long.", {
      extensions: { code: "BAD_USER_INPUT", field: "password" },
    });
  }

  return { normalizedName: trimmedName, normalizedEmail };
}

export function validateLoginInput(email: string, password: string): {
  normalizedEmail: string;
} {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    throw new GraphQLError("Invalid email or password.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  if (!password) {
    throw new GraphQLError("Invalid email or password.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  return { normalizedEmail };
}
