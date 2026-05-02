Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = scriptDir & "\Start MiMo Voice Input.cmd"
shell.Run """" & launcher & """", 0, False
