using System;
using System.Diagnostics;
using System.IO;

class VETRASetup
{
    static void Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.WriteLine("============================================================");
        Console.WriteLine("  VETRA OS — Setup Wizard");
        Console.WriteLine("  Akopark Ara — 2026");
        Console.WriteLine("============================================================");
        Console.WriteLine();

        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        string repoRoot = FindRepoRoot(exeDir);

        if (repoRoot == null)
        {
            Console.WriteLine("[ERROR] Cannot find VETRA OS repository.");
            Console.WriteLine("Please place setup.exe in the VETRA-OS-Platform directory.");
            Console.WriteLine();
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
            return;
        }

        Console.WriteLine("  Repository: " + repoRoot);
        Console.WriteLine();

        string setupPs1 = Path.Combine(repoRoot, "scripts", "setup.ps1");

        if (!File.Exists(setupPs1))
        {
            Console.WriteLine("[ERROR] setup.ps1 not found!");
            Console.WriteLine("Expected: " + setupPs1);
            Console.WriteLine();
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
            return;
        }

        Console.WriteLine("Launching setup wizard...");
        Console.WriteLine();

        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-ExecutionPolicy Bypass -NoProfile -File \"" + setupPs1 + "\"",
            UseShellExecute = false,
            RedirectStandardOutput = false,
            RedirectStandardError = false
        };

        var process = Process.Start(psi);
        process.WaitForExit();
    }

    static string FindRepoRoot(string startDir)
    {
        string dir = startDir;
        while (dir != null)
        {
            string pnpmWorkspace = Path.Combine(dir, "pnpm-workspace.yaml");
            string packageJson = Path.Combine(dir, "package.json");
            if (File.Exists(pnpmWorkspace) && File.Exists(packageJson))
            {
                return dir;
            }
            DirectoryInfo parent = Directory.GetParent(dir);
            if (parent == null) break;
            dir = parent.FullName;
        }
        return null;
    }
}
