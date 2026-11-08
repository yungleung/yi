# The docs

What each document is for, and the order to read them in. The code is the truth; when a document
disagrees with it, fix the document.

| Document | Read it when |
| --- | --- |
| `ai-context.md` | first, always: the brief, the layers, the rules, the commands, how work lands here |
| `architecture.md` | you are touching the model: blocks, the four offsets, the caret, the text, the history, source mode |
| `structure.md` | you are adding, moving or splitting modules: the tree, the class families, the conventions and what enforces them, the structural debt |
| `adding-a-node.md` | you are teaching the editor a new markdown construct |
| `adding-a-command.md` | you are adding something the author can ask for |
| `writing-comments.md` | you are writing a module header or a comment |
| `testing.md` | you are writing a test — the methodology; `../test/README.md` is the index of what exists |
| `roadmap.md` | you want the ledger: what is planned, what was measured, what was decided and left alone |
| `release-checklist.md` | you are publishing |
| `promotion.md` | you are announcing Yi, recruiting contributors, or updating repository metadata |
| `superpowers/` | the phase handoffs — specs and plans, kept as the record of *why* a decision was taken, not as instructions |

A first change reads `ai-context.md`, then `architecture.md`, then the adding-* document for what is
being added, then `testing.md` for how it will be proved.
