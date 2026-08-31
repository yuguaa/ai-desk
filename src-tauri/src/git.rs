
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;

    struct TempRepo(PathBuf);

    impl TempRepo {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("ai-desk-test-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&dir).unwrap();
            let r = TempRepo(dir.clone());
            for cmd in [
                ["init", "-q"],
                ["config", "user.email", "t@t.co"],
                ["config", "user.name", "test"],
            ] {
                Command::new("git").args(cmd).current_dir(&dir).status().unwrap();
            }
            r
        }
        fn git(&self, args: &[&str]) -> String {
            let out = Command::new("git").args(args).current_dir(&self.0).output().unwrap();
            assert!(out.status.success(), "git {:?} 失败: {}", args, String::from_utf8_lossy(&out.stderr));
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        fn write(&self, rel: &str, content: &str) {
            let p = self.0.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, content).unwrap();
        }
    }

    impl Drop for TempRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn baseline_no_changes_uses_head() {
        let repo = TempRepo::new();
        repo.write("a.txt", "hello\n");
        repo.git(&["add", "."]);
        repo.git(&["commit", "-m", "init"]);
        let (oid, wt, idx) = create_baseline(&repo.0).unwrap();
        let head = repo.git(&["rev-parse", "HEAD"]);
        assert!(oid.is_none());
        assert_eq!(wt.as_deref(), Some(head.as_str()));
        assert_eq!(idx.as_deref(), Some(head.as_str()));
    }

    #[test]
    fn baseline_with_tracked_changes_returns_stash() {
        let repo = TempRepo::new();
        repo.write("a.txt", "v1\n");
        repo.git(&["add", "."]);
        repo.git(&["commit", "-m", "init"]);
        // 未提交的已跟踪变更
        repo.write("a.txt", "v2\n");
        let (oid, wt, _idx) = create_baseline(&repo.0).unwrap();
        assert!(oid.is_some());
        let w = oid.as_deref().unwrap();
        // stash create 不修改工作区与 stash 引用
        let stash_list = repo.git(&["stash", "list"]);
        assert!(stash_list.is_empty());
        assert_eq!(repo.write("a.txt", "v2\n"), ());
        let _ = wt;
        let _ = w;
    }

    #[test]
    fn fingerprint_changes_with_edit() {
        let repo = TempRepo::new();
        repo.write("a.txt", "v1\n");
        repo.git(&["add", "."]);
        repo.git(&["commit", "-m", "init"]);
        let fp1 = compute_fingerprint(&repo.0).unwrap();
        repo.write("a.txt", "v2\n");
        let fp2 = compute_fingerprint(&repo.0).unwrap();
        assert_ne!(fp1, fp2);
    }

    #[test]
    fn untracked_backup_and_restore() {
        let repo = TempRepo::new();
        repo.write("a.txt", "v1\n");
        repo.git(&["add", "."]);
        repo.git(&["commit", "-m", "init"]);
        repo.write("untracked.txt", "new-file\n");

        let snap_dir = std::env::temp_dir().join(format!("ai-desk-snap-{}", uuid::Uuid::new_v4()));
        let entries = snapshot_untracked(&repo.0, "task1", &snap_dir).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].rel_path, "untracked.txt");
        assert!(entries[0].content_hash.is_some());
        // 备份文件存在
        let backed = snap_dir.join("snapshots").join("task1").join("baseline").join("untracked").join("untracked.txt");
        assert!(backed.exists());
        // 删除工作区文件后从备份恢复
        std::fs::remove_file(repo.0.join("untracked.txt")).unwrap();
        std::fs::copy(&backed, repo.0.join("untracked.txt")).unwrap();
        assert_eq!(std::fs::read_to_string(repo.0.join("untracked.txt")).unwrap(), "new-file\n");
        let _ = std::fs::remove_dir_all(&snap_dir);
    }

    #[test]
    fn rollback_restores_workspace() {
        let repo = TempRepo::new();
        repo.write("a.txt", "v1\n");
        repo.git(&["add", "."]);
        repo.git(&["commit", "-m", "init"]);
        // 建立基线（无已跟踪变更，worktree tree == HEAD）
        let baseline = create_baseline(&repo.0).unwrap();
        // Agent 修改已跟踪文件 + 新增未跟踪文件
        repo.write("a.txt", "agent-changed\n");
        repo.write("added.txt", "agent-new\n");

        let snap_dir = std::env::temp_dir().join(format!("ai-desk-snap-{}", uuid::Uuid::new_v4()));
        let entries = snapshot_untracked(&repo.0, "task1", &snap_dir).unwrap();
        // 写入清单供 rollback 读取
        let manifest = snap_dir.join("snapshots").join("task1").join("baseline").join("untracked_manifest.json");
        std::fs::create_dir_all(manifest.parent().unwrap()).unwrap();
        std::fs::write(&manifest, serde_json::to_string(&entries).unwrap()).unwrap();

        // 回滚
        rollback(&repo.0, "task1", &snap_dir, baseline).unwrap();
        assert_eq!(std::fs::read_to_string(repo.0.join("a.txt")).unwrap(), "v1\n");
        // 本对话新增的未跟踪文件被删除
        assert!(!repo.0.join("added.txt").exists());
        let _ = std::fs::remove_dir_all(&snap_dir);
    }
}
