const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", ["convex", "web", "ui", "deps"]],
  },
};

export default config;
