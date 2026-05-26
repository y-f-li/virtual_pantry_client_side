"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Card, DatePicker, Radio, Space, Spin, Typography, App } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import statsStyles from "@/styles/stats.module.css";

import { useApi } from "@/hooks/useApi";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const { Title, Text, Paragraph } = Typography;

const CHILD_MAX_AGE_MONTHS = 96;

type LifeStageGroup =
  | "CHILD"
  | "MALE"
  | "FEMALE"
  | "PREGNANT"
  | "BREASTFEEDING";

type Sex = "MALE" | "FEMALE";
type FemaleStatus = "NONE" | "PREGNANT" | "BREASTFEEDING";

interface UserPersonalProfileGetDTO {
  id: number;
  userId: number;
  birthDate: string;
  lifeStageGroup: LifeStageGroup;
}

interface UserPersonalProfileUpdateDTO {
  birthDate: string;
  lifeStageGroup: LifeStageGroup;
}

interface SavedProfileSummary {
  ageYears: number | null;
  ageMonths: number;
  lifeStageGroup: LifeStageGroup;
}

function calculateAgeYears(birthDate: Dayjs | null): number | null {
  if (!birthDate) {
    return null;
  }

  const today = dayjs();
  let ageYears = today.year() - birthDate.year();
  const birthdayThisYear = birthDate.year(today.year());

  if (today.isBefore(birthdayThisYear, "day")) {
    ageYears -= 1;
  }

  return ageYears;
}

function calculateAgeMonths(birthDate: Dayjs | null): number | null {
  if (!birthDate) {
    return null;
  }

  return dayjs().diff(birthDate, "month");
}

function hydrateSelectionsFromLifeStageGroup(lifeStageGroup: LifeStageGroup | null): {
  sex: Sex | null;
  femaleStatus: FemaleStatus | null;
} {
  if (lifeStageGroup === "MALE") {
    return { sex: "MALE", femaleStatus: null };
  }

  if (lifeStageGroup === "PREGNANT") {
    return { sex: "FEMALE", femaleStatus: "PREGNANT" };
  }

  if (lifeStageGroup === "BREASTFEEDING") {
    return { sex: "FEMALE", femaleStatus: "BREASTFEEDING" };
  }

  if (lifeStageGroup === "FEMALE") {
    return { sex: "FEMALE", femaleStatus: "NONE" };
  }

  return { sex: null, femaleStatus: null };
}

function getLifeStageLabel(lifeStageGroup: LifeStageGroup): string {
  switch (lifeStageGroup) {
    case "CHILD":
      return "Child";
    case "MALE":
      return "Male";
    case "FEMALE":
      return "Female";
    case "PREGNANT":
      return "Pregnant";
    case "BREASTFEEDING":
      return "Breastfeeding";
  }
}

function deriveLifeStageGroup(
  birthDate: Dayjs | null,
  sex: Sex | null,
  femaleStatus: FemaleStatus | null,
): LifeStageGroup | null {
  const ageMonths = calculateAgeMonths(birthDate);

  if (ageMonths === null || !sex) {
    return null;
  }

  if (ageMonths <= CHILD_MAX_AGE_MONTHS) {
    return "CHILD";
  }

  if (sex === "MALE") {
    return "MALE";
  }

  if (femaleStatus === "PREGNANT") {
    return "PREGNANT";
  }

  if (femaleStatus === "BREASTFEEDING") {
    return "BREASTFEEDING";
  }

  if (femaleStatus === "NONE") {
    return "FEMALE";
  }

  return null;
}

const UserPersonalProfileDetailPage: React.FC = () => {
  const { isAuthenticated } = useAuthGuard();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const { message } = App.useApp();

  const userId = params.id;

  const [birthDate, setBirthDate] = useState<Dayjs | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [femaleStatus, setFemaleStatus] = useState<FemaleStatus | null>(null);
  const [savedProfileSummary, setSavedProfileSummary] = useState<SavedProfileSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageMonths = useMemo(() => calculateAgeMonths(birthDate), [birthDate]);
  const computedLifeStageGroup = useMemo(
    () => deriveLifeStageGroup(birthDate, sex, femaleStatus),
    [birthDate, sex, femaleStatus],
  );
  const shouldShowFemaleStatus = ageMonths !== null && ageMonths > CHILD_MAX_AGE_MONTHS && sex === "FEMALE";

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      return;
    }

    let cancelled = false;

    const loadPersonalProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const profile = await api.get<UserPersonalProfileGetDTO>(
          `/users/${userId}/personal-profile`,
        );

        if (cancelled) {
          return;
        }

        const hydratedSelections = hydrateSelectionsFromLifeStageGroup(
          profile.lifeStageGroup ?? null,
        );

        setBirthDate(profile.birthDate ? dayjs(profile.birthDate) : null);
        setSex(hydratedSelections.sex);
        setFemaleStatus(hydratedSelections.femaleStatus);
        setSavedProfileSummary(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const status = (loadError as { status?: number })?.status;

        if (status === 404) {
          setBirthDate(null);
          setSex(null);
          setFemaleStatus(null);
          setSavedProfileSummary(null);
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load personal profile.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPersonalProfile();

    return () => {
      cancelled = true;
    };
  }, [api, isAuthenticated, userId]);

  const handleSavePersonalProfile = async () => {
    if (!birthDate || !computedLifeStageGroup) {
      message.error("Please select gender, birth date, and the required profile details.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: UserPersonalProfileUpdateDTO = {
        birthDate: birthDate.format("YYYY-MM-DD"),
        lifeStageGroup: computedLifeStageGroup,
      };

      const updatedProfile = await api.put<UserPersonalProfileGetDTO>(
        `/users/${userId}/personal-profile`,
        payload,
      );

      const updatedBirthDate = updatedProfile.birthDate ? dayjs(updatedProfile.birthDate) : birthDate;
      const updatedLifeStageGroup = updatedProfile.lifeStageGroup ?? computedLifeStageGroup;
      const hydratedSelections = hydrateSelectionsFromLifeStageGroup(updatedLifeStageGroup);

      setBirthDate(updatedBirthDate);

      if (updatedLifeStageGroup !== "CHILD") {
        setSex(hydratedSelections.sex);
        setFemaleStatus(hydratedSelections.femaleStatus);
      }

      setSavedProfileSummary({
        ageYears: calculateAgeYears(updatedBirthDate),
        ageMonths: calculateAgeMonths(updatedBirthDate) ?? 0,
        lifeStageGroup: updatedLifeStageGroup,
      });
      message.success("Personal profile saved.");
    } catch (saveError) {
      const errorMessage =
        saveError instanceof Error
          ? saveError.message
          : "Could not save personal profile.";

      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleBirthDateChange = (newBirthDate: Dayjs | null) => {
    setBirthDate(newBirthDate);
    setSavedProfileSummary(null);
  };

  const handleSexChange = (selectedSex: Sex) => {
    setSex(selectedSex);
    setFemaleStatus(null);
    setSavedProfileSummary(null);
  };

  const handleFemaleStatusChange = (selectedFemaleStatus: FemaleStatus) => {
    setFemaleStatus(selectedFemaleStatus);
    setSavedProfileSummary(null);
  };

  const disableInvalidBirthDates = (currentDate: Dayjs) => {
    const latestAllowedBirthDate = dayjs().subtract(1, "year");
    return currentDate.isAfter(latestAllowedBirthDate, "day");
  };

  return (
    <VirtualPantryAppShell activeNav="dashboard">
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div className={statsStyles.pageHeader}>
          <Title level={2} className={statsStyles.pageTitle}>
            User Personal Profile
          </Title>
          <Paragraph className={statsStyles.pageSubtitle}>
            Testing page for setting and updating the user&apos;s personal details.
          </Paragraph>
          <Button onClick={() => router.push(`/users/${userId}/details/nutrition-reference`)}>
            View nutrition reference
          </Button>
        </div>

        <Card
          className={statsStyles.panelCard}
          title="Personal details"
          variant="borderless"
        >
          {loading ? (
            <Spin />
          ) : (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {error && <Alert type="error" message={error} showIcon />}

              <div>
                <Text strong>Gender</Text>
                <Radio.Group
                  value={sex}
                  onChange={(event) => handleSexChange(event.target.value as Sex)}
                  style={{ display: "block", marginTop: 8 }}
                >
                  <Space direction="vertical">
                    <Radio value="MALE">Male</Radio>
                    <Radio value="FEMALE">Female</Radio>
                  </Space>
                </Radio.Group>
              </div>

              <div>
                <Text strong>Birth date</Text>
                <DatePicker
                  value={birthDate}
                  onChange={handleBirthDateChange}
                  format="YYYY-MM-DD"
                  disabledDate={disableInvalidBirthDates}
                  allowClear={false}
                  style={{ display: "block", marginTop: 8, width: "100%" }}
                />
              </div>

              {shouldShowFemaleStatus && (
                <div>
                  <Text strong>Pregnancy / breastfeeding status</Text>
                  <Radio.Group
                    value={femaleStatus}
                    onChange={(event) => handleFemaleStatusChange(event.target.value as FemaleStatus)}
                    style={{ display: "block", marginTop: 8 }}
                  >
                    <Space direction="vertical">
                      <Radio value="NONE">Neither pregnant nor breastfeeding</Radio>
                      <Radio value="PREGNANT">Pregnant</Radio>
                      <Radio value="BREASTFEEDING">Breastfeeding</Radio>
                    </Space>
                  </Radio.Group>
                </div>
              )}

              <Button
                type="primary"
                onClick={handleSavePersonalProfile}
                loading={saving}
                disabled={!computedLifeStageGroup}
              >
                Save personal profile
              </Button>

              {savedProfileSummary && (
                <div>
                  <Text strong>Saved profile</Text>
                  <div style={{ marginTop: 4 }}>
                    <Text>
                      Age: {savedProfileSummary.ageYears}y ({savedProfileSummary.ageMonths} months)
                    </Text>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Text>
                      Life stage group: {getLifeStageLabel(savedProfileSummary.lifeStageGroup)}
                    </Text>
                  </div>
                </div>
              )}
            </Space>
          )}
        </Card>
      </Space>
    </VirtualPantryAppShell>
  );
};

export default UserPersonalProfileDetailPage;
