# Coding Standards & Workflow Best Practices

A unified guide for code quality, git workflow, and style consistency across the RawDrive monorepo.

---

## 1. General Principles

*   **Boy Scout Rule:** Always leave the code cleaner than you found it.
*   **DRY (Don't Repeat Yourself):** Extract common logic to shared packages (`@rawdrive/shared-utils` or `backend/src/app/shared`).
*   **KISS (Keep It Simple, Stupid):** Prefer readability over "clever" one-liners.
*   **Type Safety:** No `any` (TS) or `Dict[Any, Any]` (Python) unless absolutely necessary.

---

## 2. Git Workflow

### Branching Strategy
*   **`main`**: Production-ready code. Protected branch.
*   **`develop`**: Integration branch (optional, if used).
*   **`feature/name-of-feature`**: New capabilities.
*   **`fix/name-of-bug`**: Bug fixes.
*   **`chore/name-of-task`**: Maintenance, refactoring, docs.

### Commit Messages (Conventional Commits)
Format: `<type>(<scope>): <subject>`

*   `feat(gallery): add password protection`
*   `fix(auth): resolve token expiration issue`
*   `docs(api): update swagger description`
*   `style(ui): fix mobile padding`
*   `refactor(db): optimize user query`
*   `test(unit): add user service tests`
*   `chore(deps): upgrade fastapi`

---

## 3. Python (Backend)

### Standards
*   **Version:** Python 3.11+
*   **Style Guide:** PEP 8 (enforced by `ruff`).
*   **Formatter:** `black`.
*   **Linter:** `ruff` (fast replacement for flake8/isort).
*   **Type Checking:** `mypy`.

### Best Practices
1.  **Type Hints:** Mandatory for function arguments and return types.
    ```python
    def calculate_total(items: list[Item]) -> float: ...
    ```
2.  **Docstrings:** Google Style for complex functions.
3.  **Imports:** Absolute imports preferred.
    ```python
    # GOOD
    from app.services.user import UserService
    # BAD
    from ..services.user import UserService
    ```
4.  **Async:** Use `async/await` for all I/O. Do not use blocking calls (`requests`, `time.sleep`) in valid async paths.

---

## 4. TypeScript (Frontend)

### Standards
*   **Version:** TypeScript 5+
*   **Style Guide:** Airbnb (modified by Prettier).
*   **Linter:** `eslint`.
*   **Formatter:** `prettier`.

### Best Practices
1.  **Interfaces vs Types:** Use `interface` for object definitions (extensible), `type` for unions/primitives.
2.  **Strict Mode:** Enabled. No implicit `any`.
3.  **Components:** Functional components only.
    ```tsx
    export const Gallery: React.FC<GalleryProps> = ({ items }) => { ... }
    ```
4.  **Hooks:** Custom logic must be extracted to `useHookName`.

---

## 5. Review Process

### Pull Request (PR) Checklist
1.  **Tests:** New code has unit tests?
2.  **Lint:** passes `npm run lint` / `ruff check .`?
3.  **Types:** passes `tsc` / `mypy`?
4.  **Self-Review:** Author has reviewed their own diff.

### Code Review Guidelines
*   **Be Kind:** Comment on code, not the person.
*   **Why, not just What:** Explain *why* a change is requested.
*   **Nitpicks:** Label minor comments as `(nit)` so they can be ignored if time is tight.
