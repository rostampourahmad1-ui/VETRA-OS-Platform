using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

class VETRASetup
{
    // ── Constants ──────────────────────────────────────────────────────
    private const string AppName = "VETRA OS";
    private const string AppVersion = "1.0.0";
    private const string CompanyName = "Akopark Ara";
    private static readonly string AppDataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "VETRA OS");
    private static readonly string LogsDir = Path.Combine(AppDataDir, "logs");
    private static readonly string ConfigDir = Path.Combine(AppDataDir, "config");
    private static readonly string DataDir = Path.Combine(AppDataDir, "data");

    [STAThread]
    static void Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;

        // ── Check for silent mode ──────────────────────────────────────
        bool silent = args.Length > 0 && (
            args[0].Equals("/S", StringComparison.OrdinalIgnoreCase) ||
            args[0].Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
            args[0].Equals("-s", StringComparison.OrdinalIgnoreCase));

        if (!silent)
        {
            Console.WriteLine("============================================================");
            Console.WriteLine("  VETRA OS — Setup Wizard v" + AppVersion);
            Console.WriteLine("  " + CompanyName + " — 2026");
            Console.WriteLine("============================================================");
            Console.WriteLine();
        }

        try
        {
            // ── Step 1: Create application directories ─────────────────
            CreateDirectories(silent);

            // ── Step 2: Find the application bundle ────────────────────
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            string bundleDir = FindBundleDir(exeDir);

            if (bundleDir == null)
            {
                LogError("Cannot find VETRA OS application bundle.", silent);
                return;
            }

            if (!silent)
                Console.WriteLine("  Application: " + bundleDir);

            // ── Step 3: Check prerequisites ────────────────────────────
            if (!CheckPrerequisites(silent))
            {
                LogError("Prerequisites check failed.", silent);
                return;
            }

            // ── Step 4: Install / configure ────────────────────────────
            InstallApplication(bundleDir, silent);

            // ── Step 5: Create shortcuts ───────────────────────────────
            CreateShortcuts(silent);

            // ── Step 6: Register uninstaller ───────────────────────────
            RegisterUninstaller();

            // ── Step 7: Launch application ─────────────────────────────
            if (!silent)
            {
                Console.WriteLine();
                Console.WriteLine("  Installation complete!");
                Console.WriteLine("  Launching VETRA OS...");
            }
            LaunchApplication();

            if (!silent)
            {
                Console.WriteLine("  Press any key to exit...");
                Console.ReadKey();
            }
        }
        catch (Exception ex)
        {
            LogError("Unexpected error: " + ex.Message, silent);
        }
    }

    // ── Directory Creation ─────────────────────────────────────────────
    static void CreateDirectories(bool silent)
    {
        if (!silent) Console.WriteLine("  Creating application directories...");
        foreach (var dir in new[] { AppDataDir, LogsDir, ConfigDir, DataDir })
        {
            Directory.CreateDirectory(dir);
        }
        if (!silent) Console.WriteLine("  [OK] Data: " + AppDataDir);
    }

    // ── Prerequisites Check ────────────────────────────────────────────
    static bool CheckPrerequisites(bool silent)
    {
        if (!silent) Console.WriteLine("  Checking prerequisites...");

        // Check .NET Framework (already running, so it's present)
        if (!silent) Console.WriteLine("  [OK] .NET Framework");

        // Check for internet connectivity (Clerk requires it)
        try
        {
            using (var client = new System.Net.WebClient())
            {
                client.DownloadString("https://clerk.com");
            }
            if (!silent) Console.WriteLine("  [OK] Internet connectivity");
        }
        catch
        {
            if (!silent) Console.WriteLine("  [WARN] Internet connectivity check failed. Clerk auth requires internet.");
        }

        return true;
    }

    // ── Application Installation ───────────────────────────────────────
    static void InstallApplication(string bundleDir, bool silent)
    {
        if (!silent) Console.WriteLine("  Installing application...");

        // Copy configuration template if it doesn't exist
        string configFile = Path.Combine(ConfigDir, "vetra.config.json");
        if (!File.Exists(configFile))
        {
            var defaultConfig = new
            {
                apiUrl = "https://api.vetragroup.ir",
                appName = AppName,
                version = AppVersion,
                installedAt = DateTime.UtcNow.ToString("o"),
                dataDir = DataDir,
                logsDir = LogsDir
            };
            File.WriteAllText(configFile,
                Newtonsoft.Json.JsonConvert.SerializeObject(defaultConfig, Newtonsoft.Json.Formatting.Indented),
                Encoding.UTF8);
            if (!silent) Console.WriteLine("  [OK] Config: " + configFile);
        }
        else
        {
            if (!silent) Console.WriteLine("  [OK] Config preserved: " + configFile);
        }

        // Copy the application bundle
        string appTargetDir = Path.Combine(AppDataDir, "app");
        if (Directory.Exists(appTargetDir))
        {
            // Upgrade: preserve data, only update app files
            if (!silent) Console.WriteLine("  [INFO] Upgrading existing installation...");
        }
        else
        {
            Directory.CreateDirectory(appTargetDir);
        }

        // Copy files from bundle to app directory
        CopyDirectoryContents(bundleDir, appTargetDir, silent);

        if (!silent) Console.WriteLine("  [OK] Application installed to: " + appTargetDir);
    }

    // ── Shortcut Creation ──────────────────────────────────────────────
    static void CreateShortcuts(bool silent)
    {
        if (!silent) Console.WriteLine("  Creating shortcuts...");

        string appLauncher = Path.Combine(AppDataDir, "app", "VETRA-OS.exe");
        string startMenuDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            AppName);
        Directory.CreateDirectory(startMenuDir);

        // Create Start Menu shortcut using WScript
        try
        {
            CreateShortcut(
                Path.Combine(startMenuDir, AppName + ".lnk"),
                appLauncher,
                AppDataDir,
                AppName + " Platform");
            if (!silent) Console.WriteLine("  [OK] Start Menu shortcut");
        }
        catch (Exception ex)
        {
            if (!silent) Console.WriteLine("  [WARN] Start Menu shortcut failed: " + ex.Message);
        }

        // Create Desktop shortcut
        try
        {
            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            CreateShortcut(
                Path.Combine(desktopDir, AppName + ".lnk"),
                appLauncher,
                AppDataDir,
                AppName + " Platform");
            if (!silent) Console.WriteLine("  [OK] Desktop shortcut");
        }
        catch (Exception ex)
        {
            if (!silent) Console.WriteLine("  [WARN] Desktop shortcut failed: " + ex.Message);
        }
    }

    // ── Uninstaller Registration ───────────────────────────────────────
    static void RegisterUninstaller()
    {
        try
        {
            string uninstallKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\VETRA_OS";
            using (var key = Registry.CurrentUser.CreateSubKey(uninstallKey))
            {
                if (key != null)
                {
                    key.SetValue("DisplayName", AppName);
                    key.SetValue("DisplayVersion", AppVersion);
                    key.SetValue("Publisher", CompanyName);
                    key.SetValue("InstallLocation", AppDataDir);
                    key.SetValue("UninstallString",
                        Path.Combine(AppDataDir, "app", "VETRA-Uninstall.exe"));
                    key.SetValue("NoModify", 1);
                    key.SetValue("NoRepair", 1);
                }
            }
        }
        catch
        {
            // Non-critical
        }
    }

    // ── Application Launch ─────────────────────────────────────────────
    static void LaunchApplication()
    {
        string appLauncher = Path.Combine(AppDataDir, "app", "VETRA-OS.exe");
        string appBat = Path.Combine(AppDataDir, "app", "VETRA-OS.bat");

        // Try EXE first, then BAT
        string launchFile = File.Exists(appLauncher) ? appLauncher :
                           File.Exists(appBat) ? appBat : null;

        if (launchFile != null)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = launchFile,
                    WorkingDirectory = AppDataDir,
                    UseShellExecute = true
                });
            }
            catch { }
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────
    static void LogError(string message, bool silent)
    {
        try
        {
            File.AppendAllText(
                Path.Combine(LogsDir, "setup-error.log"),
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine);
        }
        catch { }

        if (!silent)
        {
            Console.WriteLine("[ERROR] " + message);
            Console.WriteLine();
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
        }
    }

    static string FindBundleDir(string startDir)
    {
        // Check if we're running from the build output
        string[] markers = { "pnpm-workspace.yaml", "package.json", "vetra.config.json" };

        string dir = startDir;
        while (dir != null)
        {
            foreach (var marker in markers)
            {
                if (File.Exists(Path.Combine(dir, marker)))
                {
                    return dir;
                }
            }
            DirectoryInfo parent = Directory.GetParent(dir);
            if (parent == null) break;
            dir = parent.FullName;
        }
        return null;
    }

    static void CopyDirectoryContents(string sourceDir, string targetDir, bool silent)
    {
        foreach (string dirPath in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
        {
            string targetPath = dirPath.Replace(sourceDir, targetDir);
            Directory.CreateDirectory(targetPath);
        }

        foreach (string filePath in Directory.GetFiles(sourceDir, "*.*", SearchOption.AllDirectories))
        {
            string targetPath = filePath.Replace(sourceDir, targetDir);
            try
            {
                File.Copy(filePath, targetPath, true);
            }
            catch (Exception ex)
            {
                if (!silent)
                    Console.WriteLine("  [WARN] Cannot copy: " + Path.GetFileName(filePath) + " - " + ex.Message);
            }
        }
    }

    static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string description)
    {
        // Use WScript.Shell COM object to create shortcut
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) return;

        dynamic shell = Activator.CreateInstance(shellType);
        dynamic shortcut = shell.CreateShortcut(shortcutPath);
        shortcut.TargetPath = targetPath;
        shortcut.WorkingDirectory = workingDir;
        shortcut.Description = description;
        shortcut.Save();
    }
}
