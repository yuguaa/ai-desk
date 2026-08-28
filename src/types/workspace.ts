export type Project = {
  id: string;
  name: string;
  path: string;
  tone: string;
};

export type ConversationRecord = {
  id: string;
  projectId: string;
  title: string;
  preview: string;
  time: string;
  modifiedAt?: string;
  sessionFile?: string;
};

export type WorkspaceFile = {
  path: string;
  name: string;
  kind: "file" | "directory";
  size: number;
};

export type GitFileStatus = {
  path: string;
  code: string;
};

export type GitStatus = {
  branch: string;
  clean: boolean;
  additions: number;
  deletions: number;
  files: GitFileStatus[];
};

export type GitAction =
  | { type: "stageAll" }
  | { type: "unstageAll" }
  | { type: "stageFile"; path: string }
  | { type: "unstageFile"; path: string }
  | { type: "commit"; message: string }
  | { type: "pull" }
  | { type: "push" };

export type FilePreview =
  | {
      kind: "text";
      path: string;
      language: string;
      content: string;
    }
  | {
      kind: "image";
      path: string;
      mimeType: string;
      data: string;
    };
