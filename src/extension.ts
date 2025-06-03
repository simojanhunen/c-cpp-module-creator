import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// On activation
export function activate(context: vscode.ExtensionContext) {

    const createModuleDisposable = vscode.commands.registerCommand('c-cpp-module-creator.createModule', async (uri: vscode.Uri) => {
        try {
            let targetDir;

            if (uri && uri.fsPath) {
                // if called from context menu
                const stat = fs.statSync(uri.fsPath);
                targetDir = stat.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath);
            } else {
                // if called from command menu (Cmd/Ctrl+P)
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    const rootDir = workspaceFolders[0].uri.fsPath;
                    const subdirs = fs.readdirSync(rootDir)
                        .map(name => path.join(rootDir, name))
                        .filter(p => fs.statSync(p).isDirectory());

                    targetDir = await vscode.window.showQuickPick(
                        subdirs,
                        {
                            placeHolder: "Select Destination Directory"
                        }
                    );
                }
            }

            if (!targetDir) {
                vscode.window.showWarningMessage('User cancelled operation.');
                return;
            }

            // Get module name from user
            const moduleName = await vscode.window.showInputBox({
                prompt: 'Enter the module name:',
                placeHolder: 'e.g., device_manager',
                validateInput: (text: string) => {
                    if (!text) {
                        return 'Module name cannot be empty!';
                    }
                    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(text)) {
                        return 'Module name must start with a letter and contain only letters, numbers, underscores and dashes!';
                    }
                    return null;
                }
            });

            if (!moduleName) {
                vscode.window.showWarningMessage('User cancelled operation.');
                return; // User cancelled
            }

            await createModuleStructure(context, targetDir, moduleName);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create module: ${error}`);
        }
    });

    // Command to refresh template cache and show found templates
    const refreshTemplatesDisposable = vscode.commands.registerCommand('c-cpp-module-creator.refreshTemplates', async () => {
        try {
            // Clear the template cache
            await context.globalState.update('templateDirs', undefined);

            // Search for templates
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showWarningMessage('No workspace folder is open');
                return;
            }

            let allTemplateDirs: string[] = [];

            // Show progress while searching
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Searching for C++ module templates...",
                cancellable: false
            }, async (progress) => {
                for (const workspaceFolder of workspaceFolders) {
                    progress.report({ message: `Searching in ${workspaceFolder.name}...` });
                    const templateDirs = await findTemplateDirs(workspaceFolder.uri.fsPath);
                    allTemplateDirs = allTemplateDirs.concat(templateDirs);
                }
            });

            if (allTemplateDirs.length > 0) {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const relativePaths = allTemplateDirs.map(dir => path.relative(workspaceRoot, dir));

                const message = `Found ${allTemplateDirs.length} template director${allTemplateDirs.length === 1 ? 'y' : 'ies'}:\n${relativePaths.join('\n')}`;
                vscode.window.showInformationMessage(message, { modal: false });

                // Cache the results
                await context.globalState.update('templateDirs', allTemplateDirs);
            } else {
                vscode.window.showInformationMessage('No template directories found. The extension will use default templates.');
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to refresh templates: ${error}`);
        }
    });

    context.subscriptions.push(createModuleDisposable, refreshTemplatesDisposable);
}

async function createModuleStructure(context: vscode.ExtensionContext, baseDir: string, moduleName: string) {
    const moduleDir = path.join(baseDir, moduleName);

    // TODO: Add user configurations
    // Create directory structure
    const dirs = [
        moduleDir,
        path.join(moduleDir, 'include', moduleName),
        path.join(moduleDir, 'src'),
        path.join(moduleDir, 'tests')
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // TODO: Add dynamic templating
    // Define files to create
    const files = [
        {
            path: path.join(moduleDir, 'include', moduleName, `${moduleName}.hpp`),
            template: 'template.header.hpp'
        },
        {
            path: path.join(moduleDir, 'src', `${moduleName}.cpp`),
            template: 'template.src.cpp'
        },
        {
            path: path.join(moduleDir, 'tests', `test_${moduleName}.cpp`),
            template: 'template.test.cpp'
        },
        {
            path: path.join(moduleDir, 'CMakeLists.txt'),
            template: 'template.CMakeLists.txt'
        },
        {
            path: path.join(moduleDir, 'tests', 'CMakeLists.txt'),
            template: 'template.test.CMakeLists.txt'
        }
    ];

    // Create files with templates
    for (const file of files) {
        const content = await getTemplateContent(context, file.template, moduleName);
        fs.writeFileSync(file.path, content);
    }
}

async function getTemplateContent(context: vscode.ExtensionContext, templateName: string, moduleName: string): Promise<string> {
    // Cache template directories to avoid repeated filesystem searches
    if (!context.globalState.get('templateDirs')) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let allTemplateDirs: string[] = [];

        if (workspaceFolders) {
            for (const workspaceFolder of workspaceFolders) {
                const templateDirs = await findTemplateDirs(workspaceFolder.uri.fsPath);
                allTemplateDirs = allTemplateDirs.concat(templateDirs);
            }
        }

        // Cache the results for this session
        await context.globalState.update('templateDirs', allTemplateDirs);
    }

    const templateDirs = context.globalState.get('templateDirs') as string[] || [];

    // Try each template directory in order
    for (const templateDir of templateDirs) {
        const templatePath = path.join(templateDir, templateName);

        try {
            if (fs.existsSync(templatePath)) {
                const lowerModuleName = moduleName.toLowerCase();
                const upperModuleName = moduleName.toUpperCase();

                // TODO: Improve replacing, introduce user options
                // Replace placeholders
                let content = fs.readFileSync(templatePath, 'utf8');
                content = content.replace(/@MODULE_NAME@/g, moduleName);
                content = content.replace(/@MODULE_NAME_UPPER@/g, lowerModuleName);
                content = content.replace(/@MODULE_NAME_LOWER@/g, upperModuleName);
                return content;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Could not read template ${templatePath}:`);
        }
    }

    // Fallback to default templates
    return getDefaultTemplate(templateName, moduleName);
}

function getDefaultTemplate(templateName: string, moduleName: string): string {
    // TODO: Improve default templating
    switch (templateName) {
        case 'template.header.hpp':
            return `// Blank header`;

        case 'template.src.cpp':
            return `// Blank src`;

        case 'template.test.cpp':
            return `// Blank test`;

        case 'template.CMakeLists.txt':
            return `# Blank cmake`;

        case 'template.test.CMakeLists.txt':
            return `# Blank test cmake`;

        default:
            return `// Generated file for ${moduleName}\n`;
    }
}

async function findTemplateDirs(rootDir: string): Promise<string[]> {
    // TODO: Improve ignored dirs list
    const templateDirs: string[] = [];
    const ignoreDirs = new Set([
        'node_modules', '.git', '.svn', '.hg', 'build', 'dist', 'out',
        'target', 'bin', 'obj', '.vscode-test', '__pycache__', '.pytest_cache',
        'CMakeFiles', '.vs', '.idea', 'Debug', 'Release', 'x64', 'x86'
    ]);

    async function searchRecursively(currentDir: string, depth: number = 0): Promise<void> {
        // Limit recursion depth to prevent infinite loops and improve performance
        if (depth > 10) {
            return;
        }

        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) {
                    continue;
                }

                const fullPath = path.join(currentDir, entry.name);

                // Check if this is a template directory
                if (entry.name === 'templates' || entry.name === '.templates') {
                    // Verify it contains at least one template file
                    if (hasTemplateFiles(fullPath)) {
                        templateDirs.push(fullPath);
                    }
                    continue; // Don't recurse into template directories
                }

                // Skip ignored directories
                if (ignoreDirs.has(entry.name)) {
                    continue;
                }

                // Skip directories that are likely to be large and irrelevant
                try {
                    const stat = fs.statSync(fullPath);
                    // Skip if directory is too large (rough heuristic)
                    if (stat.isDirectory()) {
                        const subEntries = fs.readdirSync(fullPath);
                        if (subEntries.length > 10) {
                            continue;
                        }
                    }
                } catch {
                    continue; // Skip if we can't stat the directory
                }

                // Recurse into subdirectories
                await searchRecursively(fullPath, depth + 1);
            }
        } catch (error) {
            // Silently ignore permission errors or other issues
            vscode.window.showErrorMessage(`Could not read directory ${currentDir}`);
        }
    }

    await searchRecursively(rootDir);

    // Sort template directories by depth (prefer shallower ones)
    templateDirs.sort((a, b) => {
        const depthA = a.split(path.sep).length;
        const depthB = b.split(path.sep).length;
        return depthA - depthB;
    });

    return templateDirs;
}

function hasTemplateFiles(templateDir: string): boolean {
    // TODO: Add more dynamic templating
    const optionalTemplates = [
        'template.header.hpp',
        'template.src.cpp',
        'template.test.cpp',
        'template.CMakeLists.txt',
        'template.test.CMakeLists.txt'
    ];

    try {
        const files = fs.readdirSync(templateDir);
        const templateFiles = files.filter(file =>
            optionalTemplates.includes(file)
        );

        // Consider it a valid template directory if it has at least 1 template files
        return templateFiles.length >= 1;
    } catch {
        return false;
    }
}

// On deactivation
export function deactivate() { }
